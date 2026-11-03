import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { DATA_DIR } from './config.js';
import { COVER_DIR, BIOS_DIR, ASSET_DIR } from './db.js';
import { ROM_EXTS } from './platforms.js';

export const TMP_DIR = path.join(DATA_DIR, 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const COVER_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const BIOS_EXTS = new Set(['.zip']);

/** BIOS 文件名要原样保留（neogeo.zip 等），只允许安全 ASCII 字符 */
export function safeBiosName(name) {
  const base = path.basename(String(name || '')).trim();
  return /^[A-Za-z0-9._-]+\.zip$/i.test(base) ? base : '';
}

/** multipart 里的中文文件名默认按 latin1 解码，这里转回 utf8 */
export function decodeOriginalName(name) {
  try {
    const buf = Buffer.from(name, 'latin1');
    const utf8 = buf.toString('utf8');
    return utf8.includes('\uFFFD') ? name : utf8;
  } catch {
    return name;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(decodeOriginalName(file.originalname)).toLowerCase();
    cb(null, `${Date.now()}-${nanoid(10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 512 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(decodeOriginalName(file.originalname)).toLowerCase();
    if (file.fieldname === 'cover') {
      if (!COVER_EXTS.has(ext)) return cb(new Error('封面仅支持 png / jpg / webp / gif 图片'));
      return cb(null, true);
    }
    if (file.fieldname === 'rom') {
      if (!ROM_EXTS.has(ext)) {
        return cb(new Error(`不支持的 ROM 格式 ${ext || '(无扩展名)'}，请上传 ${[...ROM_EXTS].join(' ')}`));
      }
      return cb(null, true);
    }
    if (file.fieldname === 'bios') {
      if (!BIOS_EXTS.has(ext)) return cb(new Error('BIOS 只接受 .zip 文件'));
      return cb(null, true);
    }
    if (file.fieldname === 'image') {
      if (!COVER_EXTS.has(ext)) return cb(new Error('仅支持 png / jpg / webp / gif / avif 图片'));
      return cb(null, true);
    }
    return cb(new Error('未知的上传字段'));
  },
});

export const gameUpload = upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'rom', maxCount: 1 },
]);

/** 系列封面：只有一张封面图 */
export const seriesUpload = upload.fields([{ name: 'cover', maxCount: 1 }]);

export const biosUpload = upload.single('bios');
export const imageUpload = upload.single('image');

/** 把临时文件搬到正式目录，返回相对 URL / 文件名 */
export function moveCover(tmpPath, originalName) {
  const ext = path.extname(originalName).toLowerCase() || '.png';
  const filename = `${nanoid(14)}${ext}`;
  fs.renameSync(tmpPath, path.join(COVER_DIR, filename));
  return `/uploads/covers/${filename}`;
}

/** 站点素材图：落到 data/assets，返回可直接使用的 URL */
export function moveAsset(tmpPath, originalName) {
  const ext = path.extname(originalName).toLowerCase() || '.png';
  const filename = `${nanoid(14)}${ext}`;
  fs.renameSync(tmpPath, path.join(ASSET_DIR, filename));
  return { url: `/uploads/assets/${filename}`, filename };
}

/** 保存 BIOS：文件名本身就是模拟器查找的标识（neogeo.zip），所以保留原名 */
export function moveBios(tmpPath, name) {
  const safe = safeBiosName(name);
  if (!safe) throw new Error('BIOS 文件名只能是英文、数字、点、下划线、横线，且以 .zip 结尾');
  const target = path.join(BIOS_DIR, safe);
  fs.renameSync(tmpPath, target);
  return { name: safe, size: fs.statSync(target).size };
}

export function removeFileQuietly(absolutePath) {
  try {
    if (absolutePath && fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch {
    /* 清理失败不影响主流程 */
  }
}

export function cleanupTmp(files) {
  for (const list of Object.values(files || {})) {
    for (const f of list || []) removeFileQuietly(f.path);
  }
}
