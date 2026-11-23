import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { db, ROM_DIR, BIOS_DIR } from './db.js';
import {
  PLATFORMS,
  PLATFORM_MAP,
  ROM_EXTS,
  LEGACY_PLATFORM_IDS,
  guessPlatform,
  guessPlatformStrict,
  guessPlatformFromName,
} from './platforms.js';

/**
 * ROM 资源归类规则
 * ---------------------------------------------------------------
 * data/roms/<平台 id>/
 *   ├── mslug-xxxx.zip        游戏 ROM（文件名尽量保留原始名）
 *   └── resources/            该平台的附加资源（BIOS、系统文件、说明文档…）
 *
 * 平台目录名就是 platforms.js 里的平台 id（fc / sfc / arcade / neogeo …），
 * 目录名与平台简称一致，扫描目录时可不依赖数据库直接反推平台。
 */
export const RESOURCES_DIRNAME = 'resources';

export function platformDir(platformId) {
  const id = PLATFORM_MAP.has(platformId) ? platformId : null;
  return path.join(ROM_DIR, id || 'other');
}

export function relRomPath(platformId, filename) {
  const dir = PLATFORM_MAP.has(platformId) ? platformId : 'other';
  return `${dir}/${filename}`;
}

/**
 * 迁移旧平台目录（nes → fc、snes → sfc）。
 * 目标目录已存在时逐个文件搬过去（不覆盖同名文件），随后删掉空壳目录。
 * 整个过程 best-effort：任何一步失败只记录，不阻断启动。
 */
export function migrateLegacyRomDirs() {
  for (const [oldId, newId] of Object.entries(LEGACY_PLATFORM_IDS)) {
    const oldDir = path.join(ROM_DIR, oldId);
    if (!fs.existsSync(oldDir) || !fs.statSync(oldDir).isDirectory()) continue;
    const newDir = path.join(ROM_DIR, newId);
    try {
      fs.mkdirSync(newDir, { recursive: true });
      for (const entry of fs.readdirSync(oldDir, { withFileTypes: true })) {
        const src = path.join(oldDir, entry.name);
        const dest = path.join(newDir, entry.name);
        if (fs.existsSync(dest)) continue; // 同名已存在，保留目标文件
        fs.renameSync(src, dest);
      }
      // 只剩空目录才算迁移完成；还有残留文件就保留，避免误删
      if (fs.readdirSync(oldDir).length === 0) {
        fs.rmSync(oldDir, { recursive: true, force: true });
        console.log(`  ▸ ROM 目录迁移: ${oldId}/ → ${newId}/`);
      }
    } catch (err) {
      console.warn(`  ! ROM 目录迁移 ${oldId} → ${newId} 失败:`, err.message);
    }
  }
}

/** 每个平台目录 + resources 子目录，启动时建好，管理员可直接往里丢文件 */
export function ensureRomLayout() {
  fs.mkdirSync(ROM_DIR, { recursive: true });
  migrateLegacyRomDirs();
  // roms/resources：全平台共用的封面目录，放一份就能管住所有平台
  fs.mkdirSync(path.join(ROM_DIR, RESOURCES_DIRNAME), { recursive: true });
  for (const p of PLATFORMS) {
    fs.mkdirSync(path.join(ROM_DIR, p.id, RESOURCES_DIRNAME), { recursive: true });
  }
}

/** 文件名清洗：保留中文，但去掉路径分隔符与控制字符 */
export function safeFileName(name) {
  const base = String(name || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 120);
  return base || `rom-${nanoid(8)}`;
}

/**
 * rom_file 可能是「平台目录/文件名」（新）或「文件名」（旧版平铺）。
 * 两种情况都返回真实绝对路径，找不到返回 null。
 */
export function resolveRomPath(romFile) {
  const rel = String(romFile || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return null;
  if (rel.includes('..')) return null;

  const direct = path.join(ROM_DIR, rel);
  if (direct.startsWith(ROM_DIR) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }
  // 旧数据：只在根目录平铺，文件已被手工挪进平台目录时按文件名兜底
  const base = path.basename(rel);
  for (const p of PLATFORMS) {
    const candidate = path.join(ROM_DIR, p.id, base);
    if (fs.existsSync(candidate)) return candidate;
  }
  const flat = path.join(ROM_DIR, base);
  if (fs.existsSync(flat)) return flat;
  return null;
}

/** 校验扩展名 / romset 命名，并把临时文件搬进平台目录 */
export function saveRom(tmpPath, originalName, platformId) {
  const platform = PLATFORM_MAP.get(platformId);
  if (!platform) throw new Error('请选择有效的游戏平台（或让系统按扩展名自动识别）');

  const original = safeFileName(originalName);
  const ext = path.extname(original).toLowerCase();
  const allowed = platform.exts;
  if (!allowed.includes(ext)) {
    throw new Error(`该平台不支持 ${ext || '(无扩展名)'} 格式，可用：${allowed.join(' ')}`);
  }
  // 街机：FBNeo 用压缩包文件名匹配 romset，名字不对会报 "Romset is unknown"
  if (platform.romsetName && !/^[A-Za-z0-9_]+\.zip$/.test(original)) {
    throw new Error(
      '街机 ROM 文件名必须是 romset 短名（只能是小写字母、数字、下划线，如 mslug.zip、sf2ce.zip），' +
        '否则模拟器内核无法识别；请改好文件名再上传。',
    );
  }

  const dir = platformDir(platform.id);
  fs.mkdirSync(dir, { recursive: true });

  let filename = original;
  if (fs.existsSync(path.join(dir, filename))) {
    if (platform.romsetName) {
      throw new Error(`平台目录 ${platform.id}/ 里已经有同名 romset「${original}」，请勿重复上传`);
    }
    const base = path.basename(original, path.extname(original));
    filename = `${base}-${nanoid(6)}${path.extname(original)}`;
  }

  const target = path.join(dir, filename);
  fs.renameSync(tmpPath, target);
  return {
    romFile: relRomPath(platform.id, filename),
    romName: original,
    size: fs.statSync(target).size,
    platformId: platform.id,
  };
}

/** 旧版平铺在 roms 根目录的已登记 ROM：按记录的平台搬进对应目录并更新数据库 */
export function migrateRomLayout(log = () => {}) {
  ensureRomLayout();
  const rows = db.prepare("SELECT id, platform, rom_file FROM games WHERE rom_file <> ''").all();
  let moved = 0;
  let relinked = 0;
  for (const row of rows) {
    const rel = String(row.rom_file).replace(/\\/g, '/');

    // 已按平台分目录：修正旧平台 id 前缀（nes/ → fc/、snes/ → sfc/）
    if (rel.includes('/')) {
      const [head, ...rest] = rel.split('/');
      const nextId = LEGACY_PLATFORM_IDS[head];
      if (nextId && rest.length) {
        const nextRel = [nextId, ...rest].join('/');
        // 新位置有文件就指向新位置；哪里都找不到也统一改成新 id，
        // 避免留下永远失效的旧前缀（rom_missing 的条目同样需要跟平台目录保持一致）
        const newAbs = path.join(ROM_DIR, nextRel);
        const oldAbs = path.join(ROM_DIR, rel);
        if (fs.existsSync(newAbs) || !fs.existsSync(oldAbs)) {
          db.prepare('UPDATE games SET rom_file = ? WHERE id = ?').run(nextRel, row.id);
          relinked += 1;
        }
      }
      continue;
    }

    const src = path.join(ROM_DIR, rel);
    if (!fs.existsSync(src)) continue;
    const dir = platformDir(row.platform);
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, rel);
    if (fs.existsSync(target)) continue;
    try {
      fs.renameSync(src, target);
      db.prepare('UPDATE games SET rom_file = ?, rom_missing = 0 WHERE id = ?').run(relRomPath(row.platform, rel), row.id);
      moved += 1;
    } catch {
      /* 单个文件搬迁失败不影响启动 */
    }
  }
  if (moved) log(`已把 ${moved} 个 ROM 归入平台目录`);
  if (relinked) log(`已修正 ${relinked} 条 ROM 记录的旧平台路径`);
  return moved + relinked;
}

/**
 * 这些子目录里放的是封面/素材，不是 ROM，递归扫描时整棵跳过。
 * 玩家扔进来的整合包（EmulationStation / Batocera）就是这种结构。
 */
const NON_ROM_SUBDIRS = new Set([
  RESOURCES_DIRNAME, 'media', 'boxart', 'images', 'covers', 'snap', 'thumbnails',
  'artwork', 'videos', 'manuals', 'fanart', 'wheels',
]);

/** 递归列目录，跳过封面/素材子目录 */
function walk(dir, out = [], depth = 0) {
  if (depth > 4) return out; // 防止异常深的目录把扫描拖死
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (NON_ROM_SUBDIRS.has(entry.name.toLowerCase())) continue;
      walk(abs, out, depth + 1);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

/** 根目录下这些是数据目录（不是 ROM 合集），扫描时跳过 */
const NON_ROM_DIRS = new Set([...NON_ROM_SUBDIRS, 'bios', 'bioses', 'assets', 'tmp']);

/**
 * 扫描磁盘上所有 ROM 文件。
 * 平台归属的判定优先级：所在目录名（含中文/大写，如「FC中文游戏全集」）> 文件扩展名。
 * 返回 { files: [{ platformId, absPath, relPath, fileName, size, needsRelocate }], unresolved: [目录名] }
 */
export function listRomCandidates() {
  const files = [];
  const unresolved = [];
  const push = (abs, platformId, needRelocate) => {
    const fileName = path.basename(abs);
    const ext = path.extname(fileName).toLowerCase();
    if (!ROM_EXTS.has(ext)) return;
    let size = 0;
    try {
      size = fs.statSync(abs).size;
    } catch {
      return;
    }
    files.push({
      platformId,
      absPath: abs,
      relPath: needRelocate ? `${platformId}/${fileName}` : path.relative(ROM_DIR, abs).replace(/\\/g, '/'),
      fileName,
      size,
      needsRelocate: needRelocate,
    });
  };

  // ① 标准布局：roms/<平台 id>/ 下的一切（支持再嵌子目录）
  for (const p of PLATFORMS) {
    for (const abs of walk(path.join(ROM_DIR, p.id))) {
      const ext = path.extname(abs).toLowerCase();
      // 平台目录里的文件：扩展名不属于该平台时按扩展名重新推断，避免放错目录就废掉
      if (p.exts.includes(ext)) push(abs, p.id, false);
      else {
        const guessed = guessPlatformStrict(abs);
        if (guessed) push(abs, guessed, true);
      }
    }
  }

  // ② 根目录下的其它子目录：玩家的 ROM 通常是「FC中文游戏全集」「SFC游戏」这种合集目录，
  //    用目录名猜平台，猜中就把里面的文件搬进对应平台目录
  let root = [];
  try {
    root = fs.readdirSync(ROM_DIR, { withFileTypes: true });
  } catch {
    root = [];
  }

  for (const entry of root) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;
    if (PLATFORM_MAP.has(entry.name) || NON_ROM_DIRS.has(entry.name)) continue;

    const dirAbs = path.join(ROM_DIR, entry.name);
    const byName = guessPlatformFromName(entry.name);
    const found = walk(dirAbs);
    let matched = 0;

    for (const abs of found) {
      const ext = path.extname(abs).toLowerCase();
      if (!ROM_EXTS.has(ext)) continue;
      // 目录名能定平台就用它；否则只信确定的扩展名（zip 不猜，避免整柜 FC 进街机）
      const pid = byName || guessPlatformStrict(abs);
      if (!pid) continue;
      push(abs, pid, true);
      matched++;
    }

    if (!matched && found.some((abs) => ROM_EXTS.has(path.extname(abs).toLowerCase()))) {
      unresolved.push(entry.name);
    }
  }

  // ③ 旧版平铺在 roms 根目录的文件
  for (const entry of root) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ROM_EXTS.has(ext)) continue;
    const platformId = guessPlatform(entry.name);
    if (!platformId) continue;
    push(path.join(ROM_DIR, entry.name), platformId, true);
  }

  return { files, unresolved };
}

/** 根目录遗留文件搬进平台目录，返回新的相对路径 */
export function relocateRom(absPath, platformId) {
  const dir = platformDir(platformId);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = safeFileName(path.basename(absPath));
  let target = path.join(dir, fileName);
  if (fs.existsSync(target) && path.resolve(target) !== path.resolve(absPath)) {
    const base = path.basename(fileName, path.extname(fileName));
    target = path.join(dir, `${base}-${nanoid(6)}${path.extname(fileName)}`);
  }
  fs.renameSync(absPath, target);
  return relRomPath(platformId, path.basename(target));
}

/** 文件名 → 默认游戏名（去掉扩展名） */
export function titleFromFileName(fileName) {
  return path.basename(String(fileName || ''), path.extname(String(fileName || ''))).trim().slice(0, 90);
}

/** 平台要求的 BIOS 是否已经在库里（扫描导入时用来决定能不能直接上架） */
export function hasBios(name) {
  if (!name) return true;
  const row = db.prepare('SELECT name FROM bios_files WHERE name = ?').get(name);
  if (!row) return false;
  return fs.existsSync(path.join(BIOS_DIR, name));
}
