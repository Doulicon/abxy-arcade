import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { ROM_DIR, COVER_DIR } from './db.js';
import { PLATFORM_MAP, guessPlatformFromName } from './platforms.js';

/**
 * ROM 封面查找
 * ---------------------------------------------------------------
 * 玩家的资源包结构不可预知，目录可能叫 resources、media、boxart、images，
 * 也可能叫「封面」「艺术图」或者任何名字，所以这里不认目录名，只认两种规则：
 *
 *   ① 图跟 ROM 同名              roms/fc/魂斗罗.jpg
 *   ② 文件夹跟 ROM 同名，里面放封面  roms/fc/media/魂斗罗/boxFront.jpg
 *
 * 往 ROM 根目录下一扔就行，目录名字随便，层数不超过 6 层都能翻到：
 *
 *   roms/
 *     fc/
 *       魂斗罗/魂斗罗.zip
 *       随便什么名字/魂斗罗/boxFront.png     ← 命中（文件夹同名）
 *       另一个名字/魂斗罗.jpg                ← 命中（图同名）
 *     resources/
 *       动作街机/mslug/boxFront.jpg          ← 全平台共用，街机 NEOGEO 都认
 *
 * 同名文件夹里优先挑 boxFront / boxart / cover / folder 这类名字，其次挑
 * 跟 ROM 同名的，最后实在只有一张图也认；logo / background / marquee 这些
 * 明确不是封面的跳过。
 *
 * 排序：同名文件夹 > 同名图片；同类型里离 ROM 越近越优先；本平台 > 全局。
 * 玩家自己上传的封面（cover_source = 'manual'）优先级最高，扫描时直接跳过。
 */

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
/** 全局桶：ROM 根目录下不属于任何平台的资源目录（resources、media 之类） */
const GLOBAL_BUCKET = '_global';
/** 同名文件夹里，这些名字优先当封面 */
const COVER_NAMES = ['boxfront', 'boxart', 'box-art', 'cover', 'folder', 'front', 'jacket', 'poster'];
/** 这些图不是封面，直接跳过 */
const NOT_COVER = new Set([
  'logo', 'background', 'bg', 'marquee', 'wheel', 'video', 'manual', 'instructions', 'readme', 'support',
]);
/** 是图片但不是封面的（截图、标题图），没有更好的选择时才用 */
const WEAK_NAMES = ['screenshot', 'screenshots', 'snap', 'thumb', 'thumbnail', 'title', 'fanart', 'mix', 'map'];
/** 这些目录里不会有封面，递归时整棵跳过（只影响性能，不影响正确性） */
const SKIP_DIRS = new Set(['bios', 'bioses', 'videos', 'manuals', 'wheels', 'music', 'tmp', 'assets']);
/** 递归深度上限：整合包再深也就 4-5 层 */
const MAX_DEPTH = 6;

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

/**
 * 宽松键：去掉 [汉化] (JP) [ACT] 这类标签和空格标点。
 * 玩家的资源包文件夹通常只写游戏名（「洛克人2」），ROM 却叫
 * 「洛克人2[NeoX汉化](JP)[ACT](2Mb).zip」，光靠原名对不上，用这层兜住。
 */
function looseKey(fileOrDir) {
  const base = path.basename(String(fileOrDir).replace(/\\/g, '/'));
  return path
    .basename(base, path.extname(base))
    .replace(/[（(\[【][^)）\]】]*[)）\]】]/g, '')
    .replace(/[\s\-_:：·.,，。'"!?！？~～/\\|]/g, '')
    .toLowerCase();
}

function extScore(abs) {
  const ext = path.extname(abs).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' ? 0 : ext === '.png' ? 1 : 2;
}

/** 递归收集目录下的图片文件 */
function listImages(dir, out = [], depth = 0) {
  if (depth > 6) return out;
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
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      listImages(abs, out, depth + 1);
    } else if (entry.isFile() && isImage(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

/** 带缓存的 listImages：同一目录被上千个 ROM 查到时只扫一次 */
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
 * 一个文件夹里的图打分：跟 ROM 同名 > boxFront > boxart/cover/folder > 随便一张 > 截图。
 * 分数越低越优先。
 */
function coverRank(abs, key) {
  const base = baseKey(abs);
  const ext = extScore(abs);
  if (key && base === key) return ext;
  if (base.startsWith('boxfront')) return 10 + ext;
  const i = COVER_NAMES.indexOf(base);
  if (i >= 0) return 20 + i * 4 + ext;
  if (COVER_NAMES.some((n) => base.startsWith(n))) return 50 + ext;
  if (WEAK_NAMES.some((n) => base.includes(n))) return 200 + ext;
  return 100 + ext;
}

/** 某个文件夹里挑一张封面；只有 logo / 背景图时返回 null */
function pickFromFolder(dir, cache, key) {
  const imgs = imgsOf(cache, dir).filter((abs) => {
    const base = baseKey(abs);
    if (NOT_COVER.has(base)) return false;
    if (base.startsWith('logo')) return false;
    if (base.startsWith('background')) return false;
    return true;
  });
  if (!imgs.length) return null;
  return imgs.sort((a, b) => coverRank(a, key) - coverRank(b, key))[0];
}

/** 候选目录离 ROM 所在目录几步（越近越可能是这个游戏的资源） */
function dirDistance(from, to) {
  const rel = path.relative(from, to);
  if (!rel) return 0;
  return rel.split(path.sep).filter(Boolean).length;
}

function bucketFor(buckets, id) {
  if (!buckets.has(id)) buckets.set(id, { files: new Map(), dirs: new Map() });
  return buckets.get(id);
}

/**
 * 扫一遍 ROM 根目录，把封面按「平台 + 文件名」建索引，一次扫描供几百个 ROM 复用。
 * 只要图片文件名或所在文件夹名能跟 ROM 对上就收，不看目录叫什么。
 */
export function buildMediaIndex(root = ROM_DIR) {
  const buckets = new Map(); // 平台 id（或 _global）-> { files: Map<key, {abs,dir}[]>, dirs: Map<key, abs[]> }
  const imgCache = new Map();
  let count = 0;

  const walk = (dir, depth, platform) => {
    if (depth > MAX_DEPTH) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const bucket = bucketFor(buckets, platform || GLOBAL_BUCKET);

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const lower = entry.name.toLowerCase();

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(lower)) continue;
        // 目录名也进索引：它是「一个游戏一个文件夹」的候选，查找时看里面有没有封面
        if (depth > 0) {
          pushTo(bucket.dirs, lower, abs);
          const loose = looseKey(entry.name);
          if (loose && loose !== lower) pushTo(bucket.dirs, loose, abs);
        }
        walk(abs, depth + 1, platform);
      } else if (entry.isFile() && isImage(entry.name)) {
        const item = { abs, dir };
        pushTo(bucket.files, baseKey(abs), item);
        const loose = looseKey(entry.name);
        if (loose && loose !== baseKey(abs)) pushTo(bucket.files, loose, item);
        count++;
      }
    }
  };

  let rootEntries = [];
  try {
    rootEntries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    rootEntries = [];
  }
  for (const entry of rootEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const abs = path.join(root, entry.name);
    const lower = entry.name.toLowerCase();
    if (SKIP_DIRS.has(lower)) continue;

    // 第一层：是平台目录就归该平台，否则（resources / media / 任意名字）全平台共用
    const pid = PLATFORM_MAP.has(lower) ? lower : guessPlatformFromName(entry.name);
    walk(abs, 1, pid || null);
  }

  return { root, buckets, imgCache, count };
}

/** 收集某个键的全部候选，带上来源层级与距离，统一排序 */
function collect(bucket, key, romDir, cache, out, weight) {
  if (!bucket || !key) return;

  // 同名文件夹：里面挑一张
  const folderDirs = bucket.dirs.get(key);
  if (folderDirs) {
    for (const folder of folderDirs) {
      const hit = pickFromFolder(folder, cache, key);
      if (hit) out.push({ abs: hit, score: weight + dirDistance(romDir, folder) * 30 });
    }
  }

  // 同名图片
  const files = bucket.files.get(key);
  if (files) {
    for (const f of files) {
      out.push({ abs: f.abs, score: weight + 100 + dirDistance(romDir, f.dir) * 30 + extScore(f.abs) });
    }
  }
}

/**
 * 给一个 ROM 找封面源文件。
 * @param {string} romAbsPath ROM 的绝对路径
 * @param {ReturnType<typeof buildMediaIndex>} [index] 批量场景复用
 * @param {string[]} [extraNames] 这个游戏的其他叫法（来自资料库），按顺序逐个试
 * @returns {string|null}
 */
export function findCoverSource(romAbsPath, index, extraNames) {
  if (!romAbsPath) return null;
  const key = baseKey(romAbsPath);
  if (!key) return null;

  const idx = index || buildMediaIndex();
  const romDir = path.dirname(romAbsPath);
  const rel = path.relative(idx.root, romAbsPath);
  const first = rel && !rel.startsWith('..') ? rel.split(path.sep)[0].toLowerCase() : '';
  const platformId = PLATFORM_MAP.has(first) ? first : guessPlatformFromName(first) || '';

  const out = [];
  const cache = idx.imgCache;

  // 逐级放宽的候选名：
  //   原名 → 去掉 [汉化](JP)[ACT] 标签 → 砍掉副标题（「洛克人2 - Dr.Wily之谜」→「洛克人2」）
  //   → 去掉尾部年份（「坦克大战2008」→「坦克大战」）
  const rawBase = path.basename(String(romAbsPath).replace(/\\/g, '/'), path.extname(romAbsPath));
  const loose = looseKey(romAbsPath);
  const mainTitle = looseKey(String(rawBase).split(/\s*[-–—:：]\s*/)[0]);
  const noYear = loose ? loose.replace(/(19|20)\d{2}$/, '') : '';

  const keys = [];
  const seenKeys = new Set();
  const addKey = (k, weight) => {
    if (!k || seenKeys.has(k)) return;
    seenKeys.add(k);
    keys.push({ k, weight });
  };
  addKey(key, 0);
  addKey(loose, 150);
  addKey(mainTitle, 320);
  addKey(noYear, 380);
  // 资源包把初代叫「洛克人1」，ROM 只写「洛克人」：补一个 +1 的名字。
  // 只试 1 不试 2/3，资源包里没有「洛克人1」时就当没这回事，不会错配到续作。
  if (loose && !/\d$/.test(loose)) addKey(`${loose}1`, 450);

  keys.forEach(({ k, weight }) => {
    // ① 本平台：同名文件夹 > 同名图片
    if (platformId) collect(idx.buckets.get(platformId), k, romDir, cache, out, weight);
    // ② 全平台共用目录（roms/resources 这类），排在平台后面
    collect(idx.buckets.get(GLOBAL_BUCKET), k, romDir, cache, out, weight + 400);
  });

  // ③ 资料库别名：玩家 ROM 叫「超级魂斗罗」，资源包却按「魂斗罗2」建文件夹，
  //    名字完全对不上，只能靠别名表把两套命名连起来
  const seen = new Set(seenKeys);
  const extras = Array.isArray(extraNames) ? extraNames : [];
  extras.forEach((name, i) => {
    const k = looseKey(name);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const w = 700 + i * 60;
    if (platformId) collect(idx.buckets.get(platformId), k, romDir, cache, out, w);
    collect(idx.buckets.get(GLOBAL_BUCKET), k, romDir, cache, out, w + 400);
  });

  // ④ 别名：改版没有自己的图时借用正传的
  aliasChain(key).forEach((alt, i) => {
    const w = 1000 * (i + 1) + 1000;
    if (platformId) collect(idx.buckets.get(platformId), alt, romDir, cache, out, w);
    collect(idx.buckets.get(GLOBAL_BUCKET), alt, romDir, cache, out, w + 400);
  });

  if (!out.length) return null;
  out.sort((a, b) => a.score - b.score);
  return out[0].abs;
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
