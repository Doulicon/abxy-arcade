import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { ROM_DIR, COVER_DIR } from './db.js';

/**
 * ROM 封面查找
 * ---------------------------------------------------------------
 * 推荐玩家把封面平铺丢进平台目录的 resources/：
 *
 *   data/roms/arcade/
 *     ├── mslug.zip
 *     ├── mslug3.zip
 *     └── resources/
 *          ├── mslug.jpg        ← 文件名 = ROM 名，就是封面
 *          ├── mslug3.png
 *          └── 合集/batman.jpg   ← 有子文件夹也照样扫
 *
 * 文件名对上就算命中，不需要一个游戏一个文件夹。同一游戏换了 rom 名
 * （killbldp 是 killbld 的加强版）自己没封面时，按 cover-aliases.json
 * 里写死的映射借用正传的封面。
 *
 * 旧结构也留着兼容：roms/<平台>/media/<rom>/boxFront.jpg（EmulationStation
 * 那套包拷过来就是这个样子），有就用，没有也不影响。
 */

const RESOURCES_DIRNAME = 'resources';
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
/** 文件夹装封面时，这些名字优先当封面 */
const COVER_NAMES = ['boxfront', 'boxart', 'cover', 'folder', 'front'];
/** 这些是 logo / 背景图，不适合当封面 */
const NOT_COVER = new Set(['logo', 'background', 'bg', 'marquee', 'wheel']);
/** ROM 根目录下这些是数据目录，不是 ROM 合集，找封面时跳过 */
const SKIP_DIRS = new Set(['covers', 'bios', 'assets', 'tmp']);

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

function baseKey(fileOrDir) {
  const base = path.basename(String(fileOrDir).replace(/\\/g, '/'));
  return path.basename(base, path.extname(base)).toLowerCase();
}

function extScore(abs) {
  const ext = path.extname(abs).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' ? 0 : ext === '.png' ? 1 : 2;
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

/** 只看这一层目录下的图片，按文件名建索引（玩家把图直接扔在平台根目录时用） */
function shallowIndex(dir) {
  const map = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return map;
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || !isImage(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const k = baseKey(abs);
    const list = map.get(k);
    if (list) list.push(abs);
    else map.set(k, [abs]);
  }
  return map;
}

function shallowOf(cache, dir) {
  if (!cache) return shallowIndex(dir);
  if (!cache.has(dir)) cache.set(dir, shallowIndex(dir));
  return cache.get(dir);
}

/** media/<rom>/ 这种文件夹装封面时挑一张：boxFront 优先，logo 之类直接排除 */
function pickFromGameDir(dir, cache) {
  const imgs = imgsOf(cache, dir).filter((abs) => !NOT_COVER.has(baseKey(abs)));
  if (!imgs.length) return null;
  const rank = (abs) => {
    const base = baseKey(abs);
    if (base.startsWith('boxfront')) return extScore(abs); // boxFront / boxFront1 / boxFront2…
    const i = COVER_NAMES.indexOf(base);
    if (i >= 0) return 10 + i * 10 + extScore(abs);
    return 60 + extScore(abs);
  };
  return imgs.sort((a, b) => rank(a) - rank(b))[0];
}

/** 扁平资源目录：同名图片优先，其次同名文件夹 */
function pickFromBucket(bucket, key, cache) {
  if (!bucket || !key) return null;
  const files = bucket.files.get(key);
  if (files && files.length) return [...files].sort((a, b) => extScore(a) - extScore(b))[0];
  const dirs = bucket.dirs.get(key);
  if (dirs && dirs.length) {
    for (const d of dirs) {
      const hit = pickFromGameDir(d, cache);
      if (hit) return hit;
    }
  }
  return null;
}

function pushTo(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 把 resources/ 里的图片按文件名建索引，子文件夹里的也收进来 */
function indexResourceDir(dir, bucket) {
  const queue = [{ dir, depth: 0 }];
  while (queue.length) {
    const { dir: cur, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4) queue.push({ dir: abs, depth: depth + 1 });
        // 顺带记成「一个游戏一个文件夹」的结构，里面可能有 boxFront.jpg
        pushTo(bucket.dirs, entry.name.toLowerCase(), abs);
      } else if (entry.isFile() && isImage(entry.name)) {
        pushTo(bucket.files, baseKey(abs), abs);
      }
    }
  }
}

/** 平台目录名：roms/<平台 id>/... 的第一段 */
function platformOf(absPath, root) {
  const rel = path.relative(root, absPath);
  if (!rel || rel.startsWith('..')) return null;
  const first = rel.split(path.sep)[0];
  return first && !first.includes('.') ? first : null;
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
        const bucket = bucketFor(plat);
        const before = bucket.files.size;
        indexResourceDir(abs, bucket);
        count += bucket.files.size - before;
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
    shallowCache: new Map(),
  };
}

/** 取某个 resources 目录的索引，批量场景下同一个目录只扫一次 */
function bucketOfDir(cache, dir) {
  if (cache.has(dir)) return cache.get(dir);
  const bucket = { files: new Map(), dirs: new Map() };
  indexResourceDir(dir, bucket);
  cache.set(dir, bucket);
  return bucket;
}

/**
 * 给一个 ROM 找封面源文件。顺序：
 *   ① 同级 / 上级 resources 里的同名图片
 *   ② 平台 resources 索引里的同名图片（含子文件夹）
 *   ③ 别名表：改版借用正传的封面
 *   ④ 旧 media 结构（同级 → 全局）
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
  const dirBuckets = index?.dirBuckets;
  const shallowCache = index?.shallowCache;

  // ① 同级 resources，往上找两级（封面可能放在分类目录，也可能在平台根）
  let dir = path.dirname(romAbsPath);
  for (let i = 0; i < 3; i++) {
    const resDir = path.join(dir, RESOURCES_DIRNAME);
    if (fs.existsSync(resDir)) {
      const bucket = dirBuckets
        ? bucketOfDir(dirBuckets, resDir)
        : (() => {
            const b = { files: new Map(), dirs: new Map() };
            indexResourceDir(resDir, b);
            return b;
          })();
      const hit = pickFromBucket(bucket, key, imgCache);
      if (hit) return hit;
      for (const alt of aliasChain(key)) {
        const aliasHit = pickFromBucket(bucket, alt, imgCache);
        if (aliasHit) return aliasHit;
      }
    }

    // 图直接扔在 ROM 旁边（不建 resources）也认，只认同名文件
    const loose = shallowOf(shallowCache, dir).get(key);
    if (loose && loose.length) {
      return [...loose].sort((a, b) => extScore(a) - extScore(b))[0];
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // ② 平台 resources 索引
  if (index && platform) {
    const bucket = index.resources.get(platform);
    const own = pickFromBucket(bucket, key, imgCache);
    if (own) return own;
    for (const alt of aliasChain(key)) {
      const hit = pickFromBucket(bucket, alt, imgCache);
      if (hit) return hit;
    }
  }

  // ③ 旧 media 结构：同级 media → 全局索引
  const siblingMedia = path.join(path.dirname(romAbsPath), 'media');
  const sameName = imgsOf(imgCache, siblingMedia).filter((abs) => baseKey(abs) === key);
  if (sameName.length) return sameName.sort((a, b) => extScore(a) - extScore(b))[0];
  const siblingDir = path.join(siblingMedia, key);
  if (fs.existsSync(siblingDir) && fs.statSync(siblingDir).isDirectory()) {
    const hit = pickFromGameDir(siblingDir, imgCache);
    if (hit) return hit;
  }

  if (!index) return null;
  if (index.files.has(key)) return index.files.get(key);
  const legacyDir = index.dirs.get(key);
  if (legacyDir) return pickFromGameDir(legacyDir, imgCache);
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
