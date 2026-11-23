import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { lookupArcade } from './catalog.js';

/**
 * 游戏资料库
 * ---------------------------------------------------------------
 * 玩家传上来的 ROM 名字往往是这样：
 *   /data/roms/fc/洛克人/洛克人2[NeoX汉化](JP)[ACT](2Mb).zip
 * 光看文件名根本不知道是什么游戏。这里内置一份各平台的 Pegasus 元数据
 * （server/game-metadata.json，3174 条，含中文名 + 简介 + 类型 + 年份），
 * 上传或扫描时按文件名自动匹配，把简介补上。
 *
 * 数据落库到 game_meta 表（一次灌入，条数变了才重灌），查找走内存索引，
 * 扫描几千个 ROM 也不会反复查库。
 *
 * 匹配是保守的，宁可匹配不上也不要张冠李戴：
 *   ① 原始文件名精确 → ② 去掉 [汉化][版本][区域] 后的名字精确
 *   ③ 去掉所有空格标点后再比 → ④ 前缀/包含且长度接近
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, 'game-metadata.json');

let data = null;
let index = null;

function loadFile() {
  if (data) return data;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data = raw && typeof raw.games === 'object' && raw.games ? raw : { count: 0, games: {} };
  } catch (err) {
    console.warn('  ! 游戏资料库读取失败，将只按文件名显示:', err.message);
    data = { count: 0, games: {} };
  }
  return data;
}

/** 建表 + 灌数据。内容版本一致就跳过，避免每次启动都全表重写 */
function seed() {
  const payload = loadFile();
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_meta (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      platform    TEXT NOT NULL DEFAULT '',
      file_key    TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      developer   TEXT NOT NULL DEFAULT '',
      publisher   TEXT NOT NULL DEFAULT '',
      genre       TEXT NOT NULL DEFAULT '',
      year        TEXT NOT NULL DEFAULT '',
      collection  TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_meta_platform_key ON game_meta(platform, file_key);
    CREATE INDEX IF NOT EXISTS idx_meta_key ON game_meta(file_key);
  `);

  // 内容版本列：数据文件换了（重新生成）就重灌
  const cols = db.prepare('PRAGMA table_info(game_meta)').all();
  if (!cols.some((c) => c.name === 'version')) {
    db.exec("ALTER TABLE game_meta ADD COLUMN version TEXT NOT NULL DEFAULT ''");
  }

  const desired = String(payload.version || `${payload.count}`);
  const first = db.prepare('SELECT version FROM game_meta LIMIT 1').get();
  const current = first ? first.version : '';
  if (current === desired) return;

  const entries = Object.entries(payload.games);
  const insert = db.prepare(
    `INSERT INTO game_meta (platform, file_key, title, description, developer, publisher, genre, year, collection, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const run = db.transaction(() => {
    db.exec('DELETE FROM game_meta');
    for (const [id, rec] of entries) {
      const cut = id.indexOf('|');
      const platform = cut >= 0 ? id.slice(0, cut) : '';
      const key = cut >= 0 ? id.slice(cut + 1) : id;
      insert.run(
        platform,
        key,
        rec.title || '',
        rec.desc || '',
        rec.dev || '',
        rec.pub || '',
        rec.genre || '',
        rec.year || '',
        rec.collection || '',
        desired,
      );
    }
  });
  run();
  console.log(`  ▸ 游戏资料库已入库: ${entries.length} 条`);
}

// 模块加载即建表灌库（db 已就绪）
seed();

/** 找 [汉化][JP](US) 这类标签，整段去掉 */
const BRACKETS = /[(（\[【][^)）\]】]*[)）\]】]/g;
const PUNCT = /[\s\-_:：·.,，。'"!?！？~～/\\|]/g;

/** 原始键：去扩展名 + 小写 + 压缩空格 */
function key1(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/'));
  return path
    .basename(base, path.extname(base))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** 键2：去掉括号标签 */
function key2(k) {
  return k.replace(BRACKETS, ' ').trim().replace(/\s+/g, ' ');
}

/** 键3：连空格标点一起去掉，最宽松的精确比较 */
function key3(k) {
  return k.replace(BRACKETS, '').replace(PUNCT, '').toLowerCase();
}

/** 两字词集合，用来判断两个名字是不是同一个游戏的不同叫法 */
function bigrams(s) {
  const t = String(s || '');
  const set = new Set();
  for (let i = 0; i + 1 < t.length; i++) set.add(t.slice(i, i + 2));
  return set;
}

function sharesBigram(a, b) {
  const A = bigrams(a);
  if (!A.size) return false;
  const B = bigrams(b);
  for (const g of A) if (B.has(g)) return true;
  return false;
}

/**
 * 一条资料记录的全部叫法：中文名、资料里的文件名、简介开头书名号里的名字。
 *
 * 简介通常写成「《魂斗罗2》或称《超级魂斗罗》」，前半句是资料库的标题，
 * 后半句才是民间汉化包用的名字。玩家 ROM 叫
 * 「超级魂斗罗 (版本2) (v2)[星空汉化](US)[ACT](2Mb).zip」，
 * 光去掉标签只能得到「超级魂斗罗」，跟资料库的「魂斗罗2」对不上，
 * 靠这条别名才能找回「魂斗罗2」，进而找到 media/魂斗罗2/boxFront.jpg。
 *
 * 只取简介前 90 字，并要求别名与标题有共同的两字词，避免把简介里
 * 提到的其它作品（《异形（Alien）》这种）当成同一游戏。
 */
function aliasesOf(title, fileKey, description) {
  const out = [];
  const push = (v) => {
    const t = String(v || '').replace(/[（(][^）)]*[）)]/g, '').trim();
    if (t.length < 2 || t.length > 30) return;
    if (!out.some((x) => key3(x) === key3(t))) out.push(t);
  };

  push(title);
  push(String(fileKey || '').replace(/\.[^.]+$/, ''));

  const head = String(description || '').slice(0, 90);
  const re = /《([^》]{1,30})》/g;
  let m;
  while ((m = re.exec(head))) {
    const name = m[1];
    if (sharesBigram(name, title) || sharesBigram(name, fileKey)) push(name);
  }
  return out;
}

/** 由归一化名字派生三级键 */
export function nameKeys(name) {
  const k1 = key1(name);
  const k2 = key2(k1);
  return { k1, k2, k3: key3(k2) };
}

function buildIndex() {
  if (index) return index;

  const rows = db.prepare('SELECT platform, file_key, title, description, developer, publisher, genre, year, collection FROM game_meta').all();
  const byPlatform = new Map(); // `${platform}|${k3}` -> rec（按文件名）
  const byTitlePlatform = new Map(); // `${platform}|${k3(title)}` -> rec（按中文名）
  const byGlobal = new Map(); // k3 -> rec（跨平台兜底，先到先得）
  const byGlobalTitle = new Map();
  const byAlias = new Map(); // `${platform}|${k3(别名)}` -> rec
  const byAliasGlobal = new Map();
  const buckets = new Map(); // 首字 -> [rec]

  // 先扫一遍收集「主名」：某个名字已经是别的记录的文件名/标题，别名就不许抢，
  // 否则「魂斗罗」这种公共词会把一批游戏带偏。
  const primary = new Set();
  for (const r of rows) {
    if (r.file_key) primary.add(key3(r.file_key));
    if (r.title) primary.add(key3(r.title));
  }

  const recs = [];

  for (const r of rows) {
    const rec = {
      title: r.title,
      description: r.description,
      developer: r.developer,
      publisher: r.publisher,
      genre: r.genre,
      year: r.year,
      collection: r.collection,
      platform: r.platform,
      aliases: aliasesOf(r.title, r.file_key, r.description),
      variants: [], // 系列序号变体，只用于找封面，不参与游戏识别
      k3: key3(r.file_key),
      t3: key3(r.title),
    };
    if (!rec.k3 && !rec.t3) continue;
    recs.push(rec);

    if (rec.k3) {
      byPlatform.set(`${r.platform}|${rec.k3}`, rec);
      if (!byGlobal.has(rec.k3)) byGlobal.set(rec.k3, rec);
      const head = rec.k3[0];
      if (!buckets.has(head)) buckets.set(head, []);
      buckets.get(head).push(rec);
    }
    if (rec.t3) {
      if (!byTitlePlatform.has(`${r.platform}|${rec.t3}`)) byTitlePlatform.set(`${r.platform}|${rec.t3}`, rec);
      if (!byGlobalTitle.has(rec.t3)) byGlobalTitle.set(rec.t3, rec);
    }

    for (const a of rec.aliases) {
      const ak = key3(a);
      if (!ak || ak === rec.k3 || ak === rec.t3) continue;
      if (primary.has(ak)) continue; // 这名字是另一条记录的主名，让位
      if (!byAlias.has(`${r.platform}|${ak}`)) byAlias.set(`${r.platform}|${ak}`, rec);
      if (!byAliasGlobal.has(ak)) byAliasGlobal.set(ak, rec);
    }
  }

  // 系列序号变体：资源包常按「魂斗罗1」「超级马里奥1」建文件夹，ROM 和资料库
  // 却叫「魂斗罗」，差一个序号就永远对不上。同一层出现「X1」时让「X」也去认它，
  // 反过来「X1」也认「X」。只进封面候选，不参与游戏识别，认错了也只是图不对。
  const titleSet = new Set(recs.map((r) => r.t3).filter(Boolean));
  for (const rec of recs) {
    if (!rec.t3) continue;
    const tail = /^(.+?)(\d)$/.exec(rec.t3);
    if (tail && tail[1].length >= 2) rec.variants.push(tail[1]);
    else if (titleSet.has(`${rec.t3}1`)) rec.variants.push(`${rec.title}1`);
    rec.variants = rec.variants.filter((v) => key3(v).length >= 2 && key3(v) !== rec.t3);
  }

  index = { byPlatform, byTitlePlatform, byGlobal, byGlobalTitle, byAlias, byAliasGlobal, buckets, size: rows.length };
  return index;
}

/** 把一个 game_meta 记录转成调用方要的字段；脏数据（developer 就是标题本身）丢掉 */
function shape(rec) {
  if (!rec) return null;
  const dev = rec.developer && rec.developer !== rec.title ? rec.developer : '';
  const pub = rec.publisher && rec.publisher !== rec.title ? rec.publisher : '';
  const year = (String(rec.year || '').match(/(19|20)\d{2}/) || [''])[0];
  return {
    title: String(rec.title || '').trim(),
    description: String(rec.description || '').trim(),
    developer: dev,
    publisher: pub,
    genre: String(rec.genre || '').trim(),
    year,
    source: rec.collection || '',
    // 同一游戏的各种叫法：中文名、资料文件名、简介里的别名，最后是系列序号变体。
    // 扫描时存进 games.aliases，封面查找按这张名单逐个试。
    aliases: [...new Set([...(rec.aliases || []), ...(rec.variants || [])])],
  };
}

/**
 * 按 ROM 文件名查游戏资料。
 * @param {string} fileName ROM 文件名（带不带路径都行）
 * @param {string} [platformId] 平台 id，优先在本平台里找，找不到再跨平台兜底
 * @returns {{title, description, developer, publisher, genre, year, source}|null}
 */
export function lookupGameMeta(fileName, platformId) {
  const keys = nameKeys(fileName);
  if (!keys.k3) return null;
  const idx = buildIndex();

  // ① 本平台 → 文件名精确
  if (platformId) {
    const hit = idx.byPlatform.get(`${platformId}|${keys.k3}`);
    if (hit) return shape(hit);
  }

  // ② 跨平台文件名精确（玩家传的 zip 被猜成街机、或平台填错时救命）
  const global = idx.byGlobal.get(keys.k3);
  if (global) return shape(global);

  // ③ 按游戏中文名反查：资料库里 file 是英文（Super Mario Bros. 3d.zip），
  //    玩家传的却是中文名（超级马里奥兄弟1 3D版.zip），只能靠 title 对上
  const k3 = keys.k3;
  if (platformId) {
    const byTitle = idx.byTitlePlatform.get(`${platformId}|${k3}`);
    if (byTitle) return shape(byTitle);
  }
  const titleHit = idx.byGlobalTitle.get(k3);
  if (titleHit) return shape(titleHit);

  // ④ 别名反查：玩家 ROM 用的是民间汉化包的名字（「超级魂斗罗」「超级马里奥兄弟」），
  //    资料库里叫「魂斗罗2」「超级马里奥1」，靠简介里的别名表把两套命名连起来
  if (platformId) {
    const byAlias = idx.byAlias.get(`${platformId}|${k3}`);
    if (byAlias) return shape(byAlias);
  }
  const aliasHit = idx.byAliasGlobal.get(k3);
  if (aliasHit) return shape(aliasHit);

  // ⑤ 前缀 / 包含匹配，要求长度接近，避免「洛克人2」错配「洛克人2 - Dr.Wily之谜」
  const head = keys.k3[0];
  const pool = idx.buckets.get(head);
  if (pool && keys.k3.length >= 4) {
    let best = null;
    let bestLen = 0;
    for (const rec of pool) {
      if (rec.k3 === keys.k3) continue;
      const shorter = rec.k3.length <= keys.k3.length ? rec.k3 : keys.k3;
      const longer = rec.k3.length > keys.k3.length ? rec.k3 : keys.k3;
      if (!longer.startsWith(shorter)) continue;
      // 短的是长的前缀，且覆盖超过 85%、且短名至少 5 个字，才算同一个游戏
      if (shorter.length < 5) continue;
      if (shorter.length / longer.length < 0.85) continue;
      if (shorter.length > bestLen) {
        best = rec;
        bestLen = shorter.length;
      }
    }
    if (best) return shape(best);
  }

  // ⑥ 老规矩：街机 romset 短名（mslug → 合金弹头），内置 1286 条
  const arcade = lookupArcade(fileName);
  if (arcade) {
    return {
      title: arcade.title,
      description: arcade.description,
      developer: '',
      publisher: '',
      genre: '',
      year: '',
      source: 'arcade-catalog',
    };
  }

  return null;
}

/** 资料库规模，用于启动日志与后台展示 */
export function metaSize() {
  try {
    return buildIndex().size;
  } catch {
    return 0;
  }
}
