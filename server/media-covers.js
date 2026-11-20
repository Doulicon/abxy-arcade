import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ROM_DIR, COVER_DIR } from './db.js';

/**
 * ROM 附带的封面（media 目录）
 * ---------------------------------------------------------------
 * 玩家整理 ROM 时习惯把封面放在 ROM 旁边的 media/ 目录里，例如：
 *
 *   roms/arcade/动作街机/mslug.zip
 *   roms/arcade/动作街机/media/mslug.jpg          ← 直接放
 *   roms/arcade/动作街机/media/boxart/mslug.jpg   ← 或藏在任意子目录
 *
 * 规则：图片文件名 = ROM 文件名（不含扩展名），后缀 jpg 优先，png/webp 也认。
 * 命中后复制一份进 data/covers，记成 /uploads/covers/xxx.jpg，
 * 这样 ROM 之后被搬去平台目录、或者玩家顺手删了 media 都不影响展示。
 */

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

/** ROM 根目录下这些是数据目录，不是 ROM 合集，找 media 时跳过 */
const SKIP_DIRS = new Set(['covers', 'bios', 'assets', 'tmp', 'resources']);

function isImage(name) {
  return IMAGE_EXTS.includes(path.extname(name).toLowerCase());
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

/** 从一组图片里挑出名字匹配的，jpg 优先 */
function pickImages(images, key) {
  const hits = images.filter(
    (abs) => path.basename(abs, path.extname(abs)).toLowerCase() === key,
  );
  if (!hits.length) return null;
  const rank = (abs) => {
    const ext = path.extname(abs).toLowerCase();
    return ext === '.jpg' || ext === '.jpeg' ? 0 : ext === '.png' ? 1 : 2;
  };
  return hits.sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * 扫一遍 ROM 根目录，把所有 media 目录里的图片建成「文件名 → 绝对路径」索引。
 * 一次扫描可以给成百上千个 ROM 用，避免每个文件都去遍历磁盘。
 * @returns {Map<string, string>}
 */
export function buildMediaIndex(root = ROM_DIR) {
  const index = new Map();

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
        for (const img of listImages(abs)) {
          const key = path.basename(img, path.extname(img)).toLowerCase();
          if (!index.has(key)) index.set(key, img); // 同名先到先得，保持稳定
        }
        continue; // media 内部不再往下找 media
      }
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      walk(abs, depth + 1);
    }
  };

  walk(root, 0);
  return index;
}

/**
 * 给一个 ROM 找封面源文件。
 * 先看 ROM 同级的 media/（最准），再查全局索引（兼容 ROM 已被搬进平台目录）。
 * @param {string} romAbsPath ROM 的绝对路径
 * @param {Map<string,string>} [index] buildMediaIndex() 的结果，可复用
 * @returns {string|null} 封面图片绝对路径
 */
export function findCoverSource(romAbsPath, index) {
  if (!romAbsPath) return null;
  const key = path.basename(romAbsPath, path.extname(romAbsPath)).toLowerCase();
  if (!key) return null;

  const siblingMedia = path.join(path.dirname(romAbsPath), 'media');
  const sibling = pickImages(listImages(siblingMedia), key);
  if (sibling) return sibling;

  if (index && index.has(key)) return index.get(key);
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
