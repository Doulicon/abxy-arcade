#!/usr/bin/env node
/**
 * 把 Pegasus 格式的 metadata 文本整理成 server/game-metadata.json
 *
 * 用法：
 *   node scripts/build-game-meta.mjs [源目录]          默认 E:/Desktop
 *   node scripts/build-game-meta.mjs ./meta --out ./server/game-metadata.json
 *
 * 输入是每个平台一份 txt（Pegasus / Skyscraper 的 metadata.pegasus.txt）：
 *   collection: FC
 *   game: 重装机兵
 *   file: 重装机兵.zip
 *   developer: xxx
 *   description: ...
 *
 * 输出按「平台|文件名归一化」建索引，供 server/game-meta.js 灌库与查找。
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_DIR = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'E:/Desktop';
const OUT =
  process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'server/game-metadata.json';

/** 源文件 → 平台 id。写在前面的是主库，同 key 冲突时主库优先 */
const SOURCES = [
  { file: 'metadata.pegasus_fc.txt', platform: 'fc', collection: 'FC' },
  { file: 'FC-HD.txt', platform: 'fc', collection: 'FC-HD' },
  { file: 'metadata.pegasus_FC hack.txt', platform: 'fc', collection: 'FC hack' },
  { file: 'SFC.txt', platform: 'sfc', collection: 'SFC' },
  { file: 'SFC hack.txt', platform: 'sfc', collection: 'SFC hack' },
  { file: 'MD.txt', platform: 'md', collection: 'MD' },
  { file: 'MD hack.txt', platform: 'md', collection: 'MD hack' },
  { file: 'MD hack(picodrive).txt', platform: 'md', collection: 'MD hack (picodrive)' },
  { file: 'GB.txt', platform: 'gb', collection: 'GB' },
  { file: 'GBC.txt', platform: 'gbc', collection: 'GBC' },
  { file: 'GBA.txt', platform: 'gba', collection: 'GBA' },
  { file: 'N64.txt', platform: 'n64', collection: 'N64' },
  { file: 'NDS.txt', platform: 'nds', collection: 'NDS' },
  { file: 'MAME ACT.txt', platform: 'arcade', collection: 'MAME ACT' },
  { file: 'MAME FTG.txt', platform: 'arcade', collection: 'MAME FTG' },
  { file: 'MAME FTG hack.txt', platform: 'arcade', collection: 'MAME FTG hack' },
  { file: 'MAME STG.txt', platform: 'arcade', collection: 'MAME STG' },
  { file: 'MAME STG V.txt', platform: 'arcade', collection: 'MAME STG V' },
  { file: 'MAME FLY.txt', platform: 'arcade', collection: 'MAME FLY' },
  { file: 'MAME FLY V.txt', platform: 'arcade', collection: 'MAME FLY V' },
];

/** Pegasus 认识的字段，其余的一律当上一条字段的续行 */
const KNOWN = new Set([
  'game', 'file', 'files', 'developer', 'publisher', 'genre', 'release', 'x-id',
  'description', 'sort-by', 'collection', 'extensions', 'launch', 'ignore-files',
  'players', 'rating', 'region', 'family', 'playcount', 'assets.boxfront', 'summary',
]);

function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gb18030').decode(buf);
  }
}

/** 解析一份 Pegasus metadata，返回 game 数组 */
function parsePegasus(text) {
  const out = [];
  let cur = null;
  let lastKey = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      lastKey = null;
      continue;
    }

    // 缩进行：上一条字段的续行（或 files 的多个文件名）
    if (/^\s/.test(line)) {
      const val = line.trim();
      if (!cur || !lastKey) continue;
      if (lastKey === 'files') cur.files.push(val);
      else if (lastKey === 'ignore-files') continue;
      else if (lastKey === 'launch') continue;
      else cur[lastKey] = cur[lastKey] ? `${cur[lastKey]}\n${val}` : val;
      continue;
    }

    const m = line.match(/^([A-Za-z][A-Za-z0-9_.-]*):\s?(.*)$/);
    if (!m) {
      if (cur && lastKey === 'description') cur.description += `\n${line}`;
      continue;
    }
    const key = m[1].toLowerCase();
    const val = m[2].trim();

    if (key === 'game') {
      cur = { title: val, files: [] };
      out.push(cur);
      lastKey = null;
      continue;
    }
    if (!cur) {
      lastKey = null; // collection 级别的字段，忽略
      continue;
    }
    if (!KNOWN.has(key)) {
      // 不是已知字段，多半是 description 里的冒号内容
      if (lastKey === 'description') cur.description += `\n${line}`;
      continue;
    }
    if (key === 'files') {
      lastKey = 'files';
      continue;
    }
    if (key === 'file') {
      if (val) cur.files.push(val);
      lastKey = null;
      continue;
    }
    if (key === 'ignore-files' || key === 'launch' || key === 'sort-by' || key === 'collection' || key === 'extensions') {
      lastKey = key; // 后面可能有缩进续行，直接吃掉
      continue;
    }
    cur[key] = val;
    lastKey = key;
  }

  return out;
}

/** 文件名 → 查找键：去扩展名、小写、压缩空白 */
export function metaKey(fileName) {
  const base = path.basename(String(fileName || '').replace(/\\/g, '/'));
  return path
    .basename(base, path.extname(base))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const games = {};
const stats = [];
let dup = 0;
let merged = 0;

/** 同一平台下标题归一化，用来把 hack 包的条目并回正版 */
function titleKey(platform, title) {
  return `${platform}|${String(title || '')
    .toLowerCase()
    .replace(/[\s\-_:：·.,，。'"!?！？]/g, '')}`;
}

// 按 SOURCES 顺序处理：主库在前，hack 包在后。同名游戏以先出现的简介为准，
// 后出现的只补自己的文件键（避免 hack 包那句「全关卡可玩」盖掉正版简介）。
const byTitle = new Map();

for (const src of SOURCES) {
  const abs = path.join(SOURCE_DIR, src.file);
  if (!fs.existsSync(abs)) {
    console.warn(`  ! 跳过（文件不存在）: ${src.file}`);
    continue;
  }
  const list = parsePegasus(decode(fs.readFileSync(abs)));
  let kept = 0;

  for (const g of list) {
    const fileName = g.files[0] || g.title;
    const key = metaKey(fileName);
    if (!key) continue;

    const id = `${src.platform}|${key}`;
    if (games[id]) {
      dup++;
      if (!games[id].desc && g.description) games[id].desc = g.description.trim();
      continue;
    }

    const tk = titleKey(src.platform, g.title);
    let rec = byTitle.get(tk);
    if (rec) {
      merged++;
    } else {
      rec = {
        title: (g.title || key).trim(),
        desc: (g.description || '').replace(/\s*\n\s*/g, ' ').trim(),
        dev: (g.developer || '').trim(),
        pub: (g.publisher || '').trim(),
        genre: (g.genre || '').trim(),
        year: (g.release || '').trim(),
        collection: src.collection,
      };
      if (!rec.title) continue;
      byTitle.set(tk, rec);
      kept++;
    }
    games[id] = rec;
  }
  stats.push({ ...src, total: list.length, kept });
  console.log(`  ${src.file.padEnd(30)} ${src.collection.padEnd(18)} 解析 ${String(list.length).padStart(4)}  新增 ${String(kept).padStart(4)}`);
}

const payload = {
  source: `Pegasus metadata (${SOURCES.length} collections)`,
  count: Object.keys(games).length,
  generatedAt: new Date().toISOString().slice(0, 10),
  // 内容版本：每次重新生成都变，服务启动时据此判断要不要重灌数据库
  version: new Date().toISOString(),
  games,
};

fs.writeFileSync(OUT, JSON.stringify(payload));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`\n共 ${payload.count} 条（重复键 ${dup}，同游戏合并 ${merged}）→ ${OUT}  ${kb} KB`);
