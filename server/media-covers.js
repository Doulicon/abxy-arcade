import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { ROM_DIR, COVER_DIR } from './db.js';

/**
 * ROM 封面查找
 * ---------------------------------------------------------------
 * 玩家拷进来的资源包有几种常见摆法，全部支持：
 *
 *   A. 一个游戏一个文件夹，里面放统一名字的图（EmulationStation 风格）
 *      data/roms/fc/resources/contra/boxFront.jpg
 *      data/roms/arcade/resources/mslug/boxart/boxFront.png
 *
 *   B. 图直接以 ROM 名命名，扁平或按分类分文件夹
 *      data/roms/fc/resources/contra.jpg
 *      data/roms/resources/mslug3.png        ← 全平台共用一份
 *
 *   C. 图就扔在 ROM 旁边，或者放在平台目录下的 media / boxart / images 里
 *      data/roms/fc/contra.png
 *      data/roms/fc/media/contra/boxFront.jpg
 *
 * 命名也只认两种：跟 ROM 同名，或者统一叫 boxFront / boxart / cover / folder。
 * 同一个文件夹里有 logo.png、background.png 这类杂图会自动跳过，只挑封面。
 *
 * 查找顺序（越具体越优先）：
 *   ① ROM 所在目录逐级往上找 resources/（最近的先）
 *   ② 该平台的 resources/（ROM 平铺在 roms 根时靠它兜底）
 *   ③ 全局 resources/：roms/resources/
 *   ④ ROM 同级：同名图片、同名文件夹、media / boxart / images 等常见目录
 * 每一层都是先查本名、再查 cover-aliases.json 里的别名（改版借正传封面）。
 *
 * 玩家自己上传的封面（cover_source = 'manual'）在扫描逻辑里直接跳过，
 * 优先级高于上面一切自动匹配。
 */

const RESOURCES_DIRNAME = 'resources';
/** 全局封面目录在索引里的桶名（不是一个真实平台） */
const GLOBAL_BUCKET = '_global';
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

/** 一个游戏一个文件夹时，这些名字优先当封面 */
const COVER_NAMES = ['boxfront', 'boxart', 'box-art', 'cover', 'folder', 'front', 'jacket', 'poster'];
/** 这些不是封面，直接跳过 */
const NOT_COVER = new Set([
  'logo', 'background', 'bg', 'marquee', 'wheel', 'video', 'manual', 'instructions', 'readme', 'support',
]);
/** 是图片但不是封面的（截图、标题图），没有更好的选择时才用 */
const WEAK_NAMES = ['screenshot', 'screenshots', 'snap', 'thumb', 'thumbnail', 'title', 'fanart', 'mix', 'map'];

/** ROM 同级这些目录算资源目录，各种前端/整合包的命名都覆盖到 */
const MEDIA_DIRNAMES = ['resources', 'media', 'boxart', 'images', 'covers', 'snap', 'thumbnails', 'artwork'];
/** 遍历 ROM 目录时这些目录里不会有 ROM，只有资源，直接跳过 */
const SKIP_DIRS = new Set([
  ...MEDIA_DIRNAMES,
  'bios', 'bioses', 'assets', 'tmp', 'videos', 'manuals', 'fanart', 'wheels', 'music',
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALIAS_FILE = path.join(HERE, 'cover-aliases.json');

let aliasCache = null;

/** 别名表：{ 改版短名: 正传短名 }，读不到就退化成空表 */
function loadAliases() {
  if (aliasCache) return aliasCache;
  try {
    const raw = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));
    aliasCache = raw && typeof raw.aliases === 'object' && raw.aliases ? raw.aliases : {};
  } catch (err) {
    console.warn('  ! 封面别名表读取失败:', err.message);
    aliasCache = {};
  }
  return aliasCache;
}

/** 某个 rom 的备用封面来源（可能多级，最多追 3 层） */
function aliasChain(key) {
  const aliases = loadAliases();
  const out = [];
  let cur = key;
  for (let i = 0; i < 3; i++) {
    const next = aliases[cur];
    if (!next || next === cur || out.includes(next)) break;
    out.push(next);
    cur = next;
  }
  return out;
}

function isImage(name) {
  return IMAGE_EXTS.includes(path.extname(name).toLowerCase());
}

function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function baseKey(fileOrDir) {
  const base = path.basename(String(fileOrDir).replace(/\\/g, '/'));
  return path.basename(base, path.extname(base)).toLowerCase();
}

function extScore(abs) {
  const ext = path.extname(abs).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' ? 0 : ext === '.png' ? 1 : 2;
}

function byExt(list) {
  return [...list].sort((a, b) => extScore(a) - extScore(b));
}

/** 递归收集目录下的图片文件 */
function listImages(dir, out = [], depth = 0) {
  if (depth > 6) return out; // 资源目录里嵌套再深也不至于超过 6 层
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

/**
 * 带缓存的 listImages。批量扫描时同一个 resources 目录会被上千个 ROM 查到，
 * 不缓存就是上千次重复递归，扫描直接卡死。
 */
function imgsOf(cache, dir) {
  if (!cache) return listImages(dir);
  if (!cache.has(dir)) cache.set(dir, listImages(dir));
  return cache.get(dir);
}

function pushTo(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * 一个文件夹里的图排个序：跟 ROM 同名 > boxFront > boxart/cover/folder > 随便一张 > 截图。
 * 返回排好序的绝对路径数组，调用方取第一张。
 */
function rankImages(imgs, key) {
  return [...imgs].sort((a, b) => coverRank(a, key) - coverRank(b, key));
}

function coverRank(abs, key) {
  const base = baseKey(abs);
  const ext = extScore(abs);
  if (key && base === key) return ext; // 和 ROM 同名，最准
  if (base.startsWith('boxfront')) return 10 + ext; // boxFront / boxFront2 / boxfront.jpg
  const i = COVER_NAMES.indexOf(base);
  if (i >= 0) return 20 + i * 4 + ext;
  if (COVER_NAMES.some((n) => base.startsWith(n))) return 50 + ext; // boxart01.png 这类
  if (WEAK_NAMES.some((n) => base.includes(n))) return 200 + ext; // 截图、标题图垫底
  return 100 + ext; // 只有一张图、名字又没规律（1.png）也认
}

/** 某个文件夹里挑一张封面；只有 logo/背景图时返回 null */
function pickFromGameDir(dir, cache, key) {
  const imgs = imgsOf(cache, dir).filter((abs) => {
    const base = baseKey(abs);
    if (NOT_COVER.has(base)) return false;
    if (base.startsWith('logo')) return false; // logo.png / logo2.png / logo_small.png
    if (base.startsWith('background')) return false;
    return true;
  });
  if (!imgs.length) return null;
  return rankImages(imgs, key)[0];
}

/**
 * 在一个「同名文件夹 / 同名图片」索引里查 key。
 * 同名文件夹优先（文件夹是为这一个游戏专门备的，内容更准），没有再退回同名图片。
 */
function pickFromBucket(bucket, key, cache) {
  if (!bucket || !key) return null;
  const dirs = bucket.dirs.get(key);
  if (dirs && dirs.length) {
    for (const d of dirs) {
      const hit = pickFromGameDir(d, cache, key);
      if (hit) return hit;
    }
  }
  const files = bucket.files.get(key);
  if (files && files.length) return byExt(files)[0];
  return null;
}

/** 先查本名，再按别名表查改版借正传的封面 */
function lookupBucket(bucket, key, cache) {
  if (!bucket) return null;
  const own = pickFromBucket(bucket, key, cache);
  if (own) return own;
  for (const alt of aliasChain(key)) {
    const hit = pickFromBucket(bucket, alt, cache);
    if (hit) return hit;
  }
  return null;
}

/** 把 resources/ 里的图片按文件名建索引，子文件夹里的也收进来 */
function indexResourceDir(dir, bucket, depth = 0) {
  if (depth > 4) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 「一个游戏一个文件夹」的结构：contra/ 里可能有 boxFront.jpg
      pushTo(bucket.dirs, entry.name.toLowerCase(), abs);
      indexResourceDir(abs, bucket, depth + 1);
    } else if (entry.isFile() && isImage(entry.name)) {
      pushTo(bucket.files, baseKey(abs), abs);
    }
  }
}

/** 只扫一层：本层图片 + 本层子目录（同名文件夹），用于 ROM 同级匹配 */
function flatBucketOf(dir) {
  const bucket = { files: new Map(), dirs: new Map() };
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return bucket;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) pushTo(bucket.dirs, entry.name.toLowerCase(), abs);
    else if (entry.isFile() && isImage(entry.name)) pushTo(bucket.files, baseKey(abs), abs);
  }
  return bucket;
}

/** 平台目录名：roms/<平台 id>/... 的第一段 */
function platformOf(absPath, root) {
  const rel = path.relative(root, absPath);
  if (!rel || rel.startsWith('..')) return null;
  const first = rel.split(path.sep)[0];
  return first && !first.includes('.') ? first : null;
}

/** 取某个 resources 目录的索引，批量场景下同一个目录只扫一次 */
function bucketOfDir(cache, dir) {
  if (cache.has(dir)) return cache.get(dir);
  const bucket = { files: new Map(), dirs: new Map() };
  indexResourceDir(dir, bucket);
  cache.set(dir, bucket);
  return bucket;
}

/** 取某个目录单层索引，用于 ROM 同级查找 */
function flatOf(cache, dir) {
  if (cache.has(dir)) return cache.get(dir);
  const bucket = flatBucketOf(dir);
  cache.set(dir, bucket);
  return bucket;
}

/**
 * 扫一遍 ROM 根目录，把 resources/ 与旧 media/ 里的封面建成索引，一次扫描供几百个 ROM 复用。
 * @returns {{root:string, resources:Map, files:Map, dirs:Map, count:number}}
 */
export function buildMediaIndex(root = ROM_DIR) {
  const resources = new Map(); // 平台 id -> { files: Map<key, string[]>, dirs: Map<key, string[]> }
  const files = new Map(); // 旧 media：mslug -> .../media/mslug.jpg
  const dirs = new Map(); // 旧 media：mslug -> .../media/mslug
  const imgCache = new Map(); // 目录 -> 图片列表，避免重复递归
  const dirBuckets = new Map(); // resources 目录 -> 已建好的索引
  let count = 0;

  const bucketFor = (platform) => {
    const id = platform || '_';
    if (!resources.has(id)) resources.set(id, { files: new Map(), dirs: new Map() });
    return resources.get(id);
  };

  const collectMedia = (mediaDir) => {
    for (const img of imgsOf(imgCache, mediaDir)) {
      const key = baseKey(img);
      if (!files.has(key)) {
        files.set(key, img);
        count++;
      }
    }
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
        if (!dirs.has(key)) {
          dirs.set(key, abs);
          count++;
        }
        scanDirs(abs, depth + 1);
      }
    };
    scanDirs(mediaDir, 0);
  };

  const walk = (dir, depth, platform) => {
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
      const lower = entry.name.toLowerCase();
      const plat = platform || (dir === root ? entry.name : null);

      if (lower === RESOURCES_DIRNAME) {
        // ROM 根目录下的 resources/ 是全平台共用；平台目录里的只服务本平台
        const isGlobal = dir === root;
        const bucket = bucketFor(isGlobal ? GLOBAL_BUCKET : plat);
        const before = bucket.files.size;
        indexResourceDir(abs, bucket);
        count += bucket.files.size - before;
        // 全局目录动辄上千个子文件夹，这里存下索引，查找时不再重扫一遍
        if (isGlobal && dirBuckets) dirBuckets.set(abs, bucket);
        continue;
      }
      if (lower === 'media') {
        collectMedia(abs);
        continue; // media 内部不再往下找
      }
      if (SKIP_DIRS.has(lower)) continue;
      walk(abs, depth + 1, plat);
    }
  };

  walk(root, 0, null);
  return {
    root,
    resources,
    files,
    dirs,
    count,
    imgCache,
    dirBuckets,
    flatCache: new Map(),
  };
}

/**
 * 给一个 ROM 找封面源文件。顺序：
 *   ① ROM 所在目录逐级往上找 resources/（最近的优先）
 *   ② 该平台的 resources/（ROM 平铺在 roms 根时靠它兜底）
 *   ③ 全局 resources/：roms/resources/
 *   ④ ROM 同级：同名图片、同名文件夹、media / boxart / images 等常见目录
 * 每层内部先查本名，再查 cover-aliases.json 里的别名。
 * @param {string} romAbsPath ROM 的绝对路径
 * @param {ReturnType<typeof buildMediaIndex>} [index] 批量场景复用
 * @returns {string|null}
 */
export function findCoverSource(romAbsPath, index) {
  if (!romAbsPath) return null;
  const key = baseKey(romAbsPath);
  if (!key) return null;

  const root = index?.root || ROM_DIR;
  const platform = platformOf(romAbsPath, root);
  const imgCache = index?.imgCache;
  const dirBuckets = index?.dirBuckets || new Map();
  const flatCache = index?.flatCache || new Map();
  const romDir = path.dirname(romAbsPath);

  // ① ROM 所在目录逐级往上找 resources/：子目录 → 平台目录 → ROM 根，最近的先
  let dir = romDir;
  for (let i = 0; i < 3; i++) {
    const resDir = path.join(dir, RESOURCES_DIRNAME);
    if (isDir(resDir)) {
      const hit = lookupBucket(bucketOfDir(dirBuckets, resDir), key, imgCache);
      if (hit) return hit;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // ② 平台 resources 索引（ROM 直接躺在 roms 根时，① 扫不到自己的平台目录）
  if (index && platform) {
    const hit = lookupBucket(index.resources.get(platform), key, imgCache);
    if (hit) return hit;
  }

  // ③ 全局 resources：roms/resources/，所有平台共用一份
  if (index) {
    const hit = lookupBucket(index.resources.get(GLOBAL_BUCKET), key, imgCache);
    if (hit) return hit;
  } else {
    const gdir = path.join(root, RESOURCES_DIRNAME);
    if (isDir(gdir)) {
      const hit = lookupBucket(bucketOfDir(dirBuckets, gdir), key, imgCache);
      if (hit) return hit;
    }
  }

  // ④ ROM 同级：同名图片 / 同名文件夹 / media、boxart、images 等常见资源目录
  dir = romDir;
  for (let i = 0; i < 3; i++) {
    const hit = lookupBucket(flatOf(flatCache, dir), key, imgCache);
    if (hit) return hit;

    // 常见资源目录单独看一层，允许里面是「同名文件夹」或「同名图片」
    for (const name of MEDIA_DIRNAMES) {
      if (name === RESOURCES_DIRNAME) continue; // ① 已经查过
      const sub = path.join(dir, name);
      if (!isDir(sub)) continue;
      const hit2 = lookupBucket(bucketOfDir(dirBuckets, sub), key, imgCache);
      if (hit2) return hit2;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // ⑤ 老索引兜底：扫描时收集到的旧 media 目录
  if (!index) return null;
  if (index.files.has(key)) return index.files.get(key);
  const legacyDir = index.dirs.get(key);
  if (legacyDir) return pickFromGameDir(legacyDir, imgCache, key);
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

/** 把资源目录里的图片复制进 data/covers，返回可直接给前端用的 URL */
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

/**
 * 源图指纹：路径 + 字节数 + 修改时间。
 * 扫描时拿它和数据库里存的比较，图没换过就沿用原封面，不会每次扫描都复制一堆新文件。
 */
export function coverFingerprint(imagePath) {
  if (!imagePath) return '';
  try {
    const st = fs.statSync(imagePath);
    return `${imagePath}|${st.size}|${Math.round(st.mtimeMs)}`;
  } catch {
    return '';
  }
}
