import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { path7za } from '7zip-bin';
import { nanoid } from 'nanoid';

const run = promisify(execFile);

/** 7z 解压/打包超时（大整合包可能较慢，给足 5 分钟） */
const SEVENZ_TIMEOUT = 5 * 60 * 1000;

/**
 * 街机 7z → zip 转换（玩家上传街机 ROM 时自动触发）。
 * ---------------------------------------------------------------
 * FBNeo 的 Emscripten 构建在编译期就禁用了 7z 支持，直接喂 .7z 会报
 * 「7z archive support is disabled for your platform」。所以街机的 7z
 * 必须在上传时转换成 zip 才能玩。家用机（melonds/snes9x 等）不需要——
 * EmulatorJS 按文件头魔数自行解压，7z 原样入库即可。
 *
 * 这里只做「解到临时目录 → 重新打包 zip」两步，全程 best-effort：
 * 任何失败都抛错，由上传接口清理临时文件，绝不留下半成品。
 */

/** 调用 7za，统一捕获非零退出码并带上人话错误 */
async function sevenz(args, timeout = SEVENZ_TIMEOUT) {
  try {
    const { stdout, stderr } = await run(path7za, args, { timeout, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim().slice(0, 300);
    const e = new Error(detail || '7z 处理失败');
    e.status = 400;
    throw e;
  }
}

/**
 * 列出 7z 内的条目（文件名列表），用于校验 romset 是否合规。
 * 返回 { name, isDir, size } 数组。
 */
async function listSevenZip(absPath) {
  const out = await sevenz(['l', '-slt', '-ba', absPath]);
  const entries = [];
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^(Path|Size|Folder)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'Path') {
      cur = { name: val.trim(), size: 0, isDir: false };
      entries.push(cur);
    } else if (key === 'Size' && cur) {
      cur.size = Number(val) || 0;
    } else if (key === 'Folder' && cur) {
      cur.isDir = val.trim() === '+';
    }
  }
  return entries;
}

/**
 * 把街机 7z 转成 zip，返回新 zip 的绝对路径。
 *
 * @param absPath  原始 7z 的绝对路径（仍在 multer 临时目录里）
 * @returns { absZipPath }  转换后 zip 的绝对路径（也在临时目录）
 *
 * 校验规则（不满足直接抛 400，避免产出黑屏的「坏游戏」）：
 *   · 必须存在非目录条目；
 *   · 条目里不能混入 .zip/.7z 嵌套压缩包；
 *   · 条目文件名必须是 FBNeo romset 风格的资源名（字母数字 + 点 + 下划线 + 连字符，
 *     不能是纯数字这种被改坏的 hack romset，也不能含中文/路径分隔符）。
 */
export async function convertArcade7zToZip(absPath) {
  if (path.extname(absPath).toLowerCase() !== '.7z') {
    throw new Error('只有 .7z 需要转换');
  }

  const entries = await listSevenZip(absPath);
  const files = entries.filter((e) => !e.isDir && e.size > 0);
  if (!files.length) {
    const e = new Error('这个 7z 里没有可用的 romset 文件');
    e.status = 400;
    throw e;
  }

  // 校验 romset 文件名：只允许字母数字 + . _ -，且不能是纯数字
  for (const f of files) {
    const base = path.basename(f.name);
    if (/\.(zip|7z|rar)$/i.test(base)) {
      const e = new Error(`romset 里不能嵌套压缩包（${base}），请解压后上传裸 romset 文件`);
      e.status = 400;
      throw e;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(base) || /^\d+(\.\d+)*$/.test(base)) {
      const e = new Error(
        `romset 文件名不合规（${base || '(空)'}）：只接受字母数字、点、下划线、横线，` +
          '且不能是纯数字。这个改版包即使转成 zip 也无法被内核识别。',
      );
      e.status = 400;
      throw e;
    }
  }

  // 解压用的工作目录，zip 产物放到它之外，避免清理时误删
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'abxy-7z-work-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abxy-7z-out-'));
  const zipPath = path.join(outDir, `romset-${nanoid(8)}.zip`);
  try {
    // 解压到工作目录（不保留内部目录层级，romset 文件应都在根）
    await sevenz(['x', `-o${work}`, '-y', '-bd', absPath]);

    // 重新打包成 zip。用 -mx=1（最快）—— romset 里是 ROM 二进制，压缩率不高，
    // 花高压缩比的 CPU 时间没意义，还容易在 NAS 上超时
    await sevenz(['a', '-tzip', '-mx=1', '-y', '-bd', zipPath, path.join(work, '*')]);

    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
      throw new Error('转换失败：没有生成 zip 文件');
    }
    return { absZipPath: zipPath, outDir };
  } catch (err) {
    fs.rmSync(outDir, { force: true, recursive: true });
    throw err;
  } finally {
    fs.rmSync(work, { force: true, recursive: true });
  }
}

export { listSevenZip };
