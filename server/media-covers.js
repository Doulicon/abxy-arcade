import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ROM_DIR, COVER_DIR } from './db.js';

/**
 * ROM 附带的封面（media 目录）
 * ---------------------------------------------------------------
 * 玩家整理 ROM 时习惯把封面放在 ROM 旁边的 media/ 目录里，常见两种摆法：
 *
 *   roms/arcade/动作街机/mslug.zip
 *   roms/arcade/动作街机/media/mslug.jpg            ← 图片名 = ROM 名
 *   roms/arcade/动作街机/media/mslug/boxFront.jpg   ← 或一个同名文件夹装封面
 *
 * 第二种是 EmulationStation 那套包的默认结构（boxFront.jpg + logo.png +
 * video.mp4 一起放），所以两种都认；优先 boxFront，logo/background 这类
 * 不当封面（小图，放上去很难看）。
 *
 * 命中后复制一份进 data/covers，记成 /uploads/covers/xxx.jpg，
 * 这样 ROM 之后被搬去平台目录、或者玩家顺手删了 media 都不影响展示。
 */

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
/** 文件夹装封面时，这些名字优先当封面 */
const COVER_NAMES = ['boxfront', 'boxart', 'cover', 'folder', 'front'];
/** 这些是 logo / 背景图，不适合当封面 */
const NOT_COVER = new Set(['logo', 'background', 'bg', 'marquee', 'wheel']);

/** ROM 根目录下这些是数据目录，不是 ROM 合集，找 media 时跳过 */
const SKIP_DIRS = new Set(['covers', 'bios', 'assets', 'tmp', 'resources']);

function isImage(name) {
  return IMAGE_EXTS.includes(path.extname(name).toLowerCase());
}

function baseKey(fileOrDir) {
  const base = path.basename(String(fileOrDir).replace(/\\/g, '/'));
  return path.basename(base, path.extname(base)).toLowerCase();
}

/** 递归收集目录下的图片文件 */
function listImages(dir, out = [], depth = 0) {
  if (depth > 6) return out; // media 里嵌套再深也不至于超过 6 层
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) listImages(abs, out, depth + 1);
    else if (entry.isFile() && isImage(entry.name)) out.push(abs);
  }
  return out;
}

/** 直接的文件名匹配：media/mslug.jpg 这种，jpg 优先 */
function pickNamedFile(images, key) {
  const hits = images.filter((abs) => baseKey(abs) === key);
  if (!hits.length) return null;
  const rank = (abs) => {
    const ext = path.extname(abs).toLowerCase();
    return ext === '.jpg' || ext === '.jpeg' ? 0 : ext === '.png' ? 1 : 2;
  };
  return hits.sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * 文件夹匹配：media/mslug/ 里挑一张。
 * boxFront 优先，logo/background 这类直接排除；只剩它们时返回 null（宁可不显示）。
 */
function pickFromGameDir(dir) {
  const imgs = listImages(dir).filter((abs) => !NOT_COVER.has(baseKey(abs)));
  if (!imgs.length) return null;
  const rank = (abs) => {
    const base = baseKey(abs);
    const ext = path.extname(abs).toLowerCase();
    const extScore = ext === '.jpg' || ext === '.jpeg' ? 0 : ext === '.png' ? 1 : 2;
    if (base.startsWith('boxfront')) return extScore; // boxFront / boxFront1 / boxFront2…
    const i = COVER_NAMES.indexOf(base);
    if (i >= 0) return 10 + i * 10 + extScore;
    return 60 + extScore;
  };
  return imgs.sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * 扫一遍 ROM 根目录，把 media 目录里的封面建成索引，一次扫描供几百个 ROM 复用。
 * @returns {{files: Map<string,string>, dirs: Map<string,string>}}
 */
export function buildMediaIndex(root = ROM_DIR) {
  const files = new Map(); // mslug -> .../media/mslug.jpg
  const dirs = new Map(); // mslug -> .../media/mslug

  const collectMedia = (mediaDir) => {
    for (const img of listImages(mediaDir)) {
      const key = baseKey(img);
      if (!files.has(key)) files.set(key, img);
    }
    // media 下按游戏分文件夹：media/mslug/boxFront.jpg
    const scanDirs = (dir, depth) => {
      if (depth > 3) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const abs = path.join(dir, entry.name);
        const key = entry.name.toLowerCase();
        if (!dirs.has(key)) dirs.set(key, abs);
        scanDirs(abs, depth + 1);
      }
    };
    scanDirs(mediaDir, 0);
  };

  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.name.toLowerCase() === 'media') {
        collectMedia(abs);
        continue; // media 内部不再往下找 media
      }
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      walk(abs, depth + 1);
    }
  };

  walk(root, 0);
  return { files, dirs };
}

/**
 * 给一个 ROM 找封面源文件。
 * 顺序：ROM 同级 media 里的同名图片 → 同级 media 下的同名文件夹 → 全局索引。
 * @param {string} romAbsPath ROM 的绝对路径
 * @param {{files: Map, dirs: Map}} [index] buildMediaIndex() 的结果，可复用
 * @returns {string|null}
 */
export function findCoverSource(romAbsPath, index) {
  if (!romAbsPath) return null;
  const key = baseKey(romAbsPath);
  if (!key) return null;

  const siblingMedia = path.join(path.dirname(romAbsPath), 'media');
  const siblingHit =
    pickNamedFile(listImages(siblingMedia), key) ||
    (() => {
      const d = path.join(siblingMedia, key);
      return fs.existsSync(d) && fs.statSync(d).isDirectory() ? pickFromGameDir(d) : null;
    })();
  if (siblingHit) return siblingHit;

  if (!index) return null;
  if (index.files.has(key)) return index.files.get(key);
  const dir = index.dirs.get(key);
  if (dir) return pickFromGameDir(dir);
  return null;
}

/** 封面 URL 指向的文件是否还在（批量删封面后数据库可能还留着旧值） */
export function coverExists(cover) {
  if (!cover || !cover.startsWith('/uploads/covers/')) return false;
  try {
    return fs.existsSync(path.join(COVER_DIR, path.basename(cover)));
  } catch {
    return false;
  }
}

/** 把 media 里的图片复制进 data/covers，返回可直接给前端用的 URL */
export function importCover(imagePath, romKey = 'cover') {
  const ext = path.extname(imagePath).toLowerCase() || '.jpg';
  const safeKey = String(romKey || 'cover')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40) || 'cover';
  const filename = `${safeKey}-${nanoid(6)}${ext}`;
  fs.mkdirSync(COVER_DIR, { recursive: true });
  fs.copyFileSync(imagePath, path.join(COVER_DIR, filename));
  return `/uploads/covers/${filename}`;
}
