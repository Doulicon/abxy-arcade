import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { nanoid } from 'nanoid';
import { db, ROM_DIR } from './db.js';
import { PLATFORM_MAP } from './platforms.js';
import { resolveRomPath, safeFileName } from './roms.js';

/**
 * 压缩包内层编码修复（玩家点按钮触发）
 * ------------------------------------------------------------------
 * 从 Windows 打包的 ROM 压缩包，条目名往往是 GBK 字节，而且没有置 zip 的
 * UTF-8 标志位（general purpose bit 11）。EmulatorJS 解压用的是 emscripten
 * 编译的 7z，只认标志位：没置位就按 ANSI 码页解，于是「魂斗罗.smc」变成一串
 * 乱码，内核按原文件名找不到 ROM，静默退回主菜单 —— 表现为「点了没反应」。
 *
 * 这类包里的数据本身是好的，解法就是把 ROM 单独解出来放一份，让 URL 末段
 * 变成真实扩展名（.nes/.smc/.gba…），模拟器就不会再走自己的解压流程。
 *
 * 为什么自己写解析：只需要「读中央目录 + inflate 单个条目」这点能力，
 * Node 内置的 zlib.inflateRawSync 就够了，不值得为一个功能引入 zip 依赖。
 *
 * 安全边界（任何一条不满足都直接抛错，绝不留下半成品）：
 *   · 街机（romsetName 平台）的 zip 是 romset，解压后内核反而认不出，禁止；
 *   · 只接受该平台 exts 白名单里的扩展名，避免把说明文档/补丁当 ROM；
 *   · 原压缩包一律保留不删，解出的文件写在同一目录，随时可回滚。
 */

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
/** 单文件体积上限：超过就不自动处理，交给管理员（避免误解大整合包） */
const MAX_ROM_BYTES = 96 * 1024 * 1024;

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

/** 带 HTTP 状态码的业务错误，接口层直接透传给前端 */
function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** 从尾部找「中央目录结尾」（EOCD 后面可能带 zip 注释，所以要往前扫） */
function findEocd(buf) {
  const limit = Math.max(0, buf.length - 0x10000 - 22);
  for (let i = buf.length - 22; i >= limit; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** 读中央目录：只有这里记录的 csize/偏移是准确的（本地头在流式写入时可能是 0） */
function readCentralDirectory(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw fail(422, '不是有效的 zip 文件（找不到目录结尾标记）');

  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (!count) throw fail(422, '压缩包是空的');
  if (count > 4096) throw fail(422, '压缩包内文件过多，不适合自动修复');
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw fail(422, '暂不支持 Zip64 格式的压缩包');
  }
  if (cdOffset + cdSize > buf.length) throw fail(422, '压缩包已损坏（目录越界）');

  const entries = [];
  let off = cdOffset;
  for (let i = 0; i < count; i += 1) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CENTRAL_SIG) {
      throw fail(422, '压缩包已损坏（目录结构异常）');
    }
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    entries.push({
      flags: buf.readUInt16LE(off + 8),
      method: buf.readUInt16LE(off + 10),
      csize: buf.readUInt32LE(off + 20),
      usize: buf.readUInt32LE(off + 24),
      localOffset: buf.readUInt32LE(off + 42),
      nameBuf: Buffer.from(buf.subarray(off + 46, off + 46 + nameLen)),
    });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 解析条目名：给出「模拟器会不会解错」的判断，以及按 GBK 还原的参考名 */
function describeName(entry) {
  const raw = entry.nameBuf;
  const isDir = raw.length > 0 && raw[raw.length - 1] === 0x2f; // 以 / 结尾
  const declaredUtf8 = (entry.flags & 0x800) !== 0;

  let validUtf8 = true;
  let name = '';
  try {
    name = utf8Strict.decode(raw);
  } catch {
    validUtf8 = false;
  }
  if (!validUtf8) {
    // 中文 Windows 打包的默认码页是 GBK；只用于落盘命名和诊断，解不出来也不影响取数据
    try {
      name = new TextDecoder('gbk').decode(raw);
    } catch {
      name = '';
    }
  }

  return {
    isDir,
    declaredUtf8,
    validUtf8,
    /** 没声明 UTF-8 又含非 ASCII 字节 → 7z 一定会按 ANSI 解，名字必乱 */
    mangled: !declaredUtf8 && raw.some((c) => c >= 0x80),
    displayName: name,
  };
}

/** 取条目原始数据（支持 store 与 deflate，其它算法直接拒绝） */
function extractEntry(buf, entry) {
  if (entry.flags & 0x1) throw fail(422, '压缩包设置了密码，无法自动修复');

  const lo = entry.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== LOCAL_SIG) {
    throw fail(422, '压缩包已损坏（数据定位失败）');
  }
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  if (start + entry.csize > buf.length) throw fail(422, '压缩包已损坏（数据越界）');

  const raw = buf.subarray(start, start + entry.csize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) {
    try {
      return zlib.inflateRawSync(raw);
    } catch (err) {
      throw fail(422, `解压失败：${err.message}`);
    }
  }
  throw fail(422, `暂不支持压缩方式 ${entry.method}`);
}

/**
 * 修复一个游戏的 ROM：把压缩包里的主 ROM 解出来落到同目录并更新数据库。
 * 幂等：同一个包重复调用只会复用已解出的文件，不会产生多份。
 * 失败抛错且不改动数据库。
 */
export function repairGameRom(gameId) {
  const row = db
    .prepare('SELECT id, title, platform, rom_file, rom_name FROM games WHERE id = ?')
    .get(gameId);
  if (!row) throw fail(404, '游戏不存在');
  if (!row.rom_file) throw fail(409, '这个游戏还没有上传 ROM，没有可修复的文件');

  const platform = PLATFORM_MAP.get(row.platform);
  if (!platform) throw fail(400, `未知平台 ${row.platform}，无法判断可用格式`);

  // 街机 zip 是 romset：内核靠压缩包名 + 内部文件名匹配，解压后一定认不出
  if (platform.romsetName) {
    throw fail(400, '街机 ROM 必须保持 zip 打包（内核按压缩包名匹配 romset），不能解压');
  }

  const absPath = resolveRomPath(row.rom_file);
  if (!absPath) throw fail(404, 'ROM 文件不在磁盘上，请管理员检查 data/roms 目录');

  if (path.extname(absPath).toLowerCase() !== '.zip') {
    throw fail(400, '只有 zip 包需要修复；.7z / 裸 ROM 由模拟器内核自己处理，无需修复');
  }

  const buf = fs.readFileSync(absPath);
  const entries = readCentralDirectory(buf);

  const candidates = [];
  for (const entry of entries) {
    const info = describeName(entry);
    if (info.isDir) continue;
    const innerExt = path.extname(info.displayName).toLowerCase();
    if (!innerExt || innerExt === '.zip') continue;
    // 平台白名单：只认该平台真能跑的格式，说明文档/金手指/补丁一律跳过
    if (!platform.exts.includes(innerExt)) continue;
    if (!entry.usize) continue;
    candidates.push({ entry, info, innerExt });
  }
  if (!candidates.length) {
    throw fail(422, `压缩包里没有找到 ${platform.short} 能用的游戏文件（可能只有说明文档或补丁）`);
  }

  // 一个包里塞了多个文件时取最大的那个，绝大多数情况就是主 ROM
  candidates.sort((a, b) => b.entry.usize - a.entry.usize);
  const pick = candidates[0];
  if (pick.entry.usize > MAX_ROM_BYTES) {
    const mb = Math.round(pick.entry.usize / 1048576);
    throw fail(422, `解压后的文件有 ${mb}MB，超过自动修复上限，请管理员手动处理`);
  }

  const data = extractEntry(buf, pick.entry);
  if (data.length !== pick.entry.usize) {
    throw fail(422, '压缩包数据不完整（解压长度与目录声明不一致），文件可能已损坏');
  }

  const dir = path.dirname(absPath);
  const rawStem = path.basename(absPath).replace(/\.zip$/i, '');
  const stem = (safeFileName(rawStem) || `game-${row.id}`).slice(0, 96);

  let targetName = `${stem}${pick.innerExt}`;
  let targetPath = path.join(dir, targetName);
  let reused = false;

  if (fs.existsSync(targetPath)) {
    const st = fs.statSync(targetPath);
    // 上次已经解过同一份数据：直接复用，重复点击不会产生多个副本
    if (st.isFile() && st.size === data.length) {
      reused = true;
    } else {
      targetName = `${stem}-${nanoid(6)}${pick.innerExt}`;
      targetPath = path.join(dir, targetName);
    }
  }

  if (!reused) {
    // 先写临时文件再改名：中途失败不会留下半截 ROM 被当成可用文件
    const tmpPath = path.join(dir, `.repair-${process.pid}-${Date.now().toString(36)}.tmp`);
    try {
      fs.writeFileSync(tmpPath, data);
      fs.renameSync(tmpPath, targetPath);
    } catch (err) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* 临时文件可能根本没建成 */
      }
      throw fail(500, `写入解压后的文件失败：${err.message}（请确认 data/roms 目录可写）`);
    }
  }

  const rel = path.relative(ROM_DIR, targetPath).split(path.sep).join('/');
  if (rel.startsWith('..')) throw fail(500, '解压目标路径越出了 ROM 目录，已中止');

  // rom_name 一并改成解出后的真实文件名：URL 末段的扩展名由它决定，
  // 模拟器就是靠这个判断「不需要解压」
  db.prepare(
    `UPDATE games SET rom_file = ?, rom_name = ?, rom_size = ?, rom_missing = 0,
       updated_at = datetime('now') WHERE id = ?`,
  ).run(rel, targetName, data.length, row.id);

  return {
    gameId: row.id,
    romFile: rel,
    romName: targetName,
    romSize: data.length,
    /** 压缩包里的原始名（GBK 已按中文还原，仅供展示/排查） */
    innerName: pick.info.displayName || '',
    /** 原包是否属于「模拟器会解错」的编码 */
    mangled: pick.info.mangled,
    reused,
    packedSize: buf.length,
    packedName: path.basename(absPath),
  };
}
