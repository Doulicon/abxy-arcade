/**
 * 从 EmulationStation 的 gamelist.xml 生成封面别名表
 * ---------------------------------------------------------------
 * 街机 ROM 的改版常换一个短名（killbld → killbldp、ssf2 → ssf2j），
 * 但其实是同一个游戏，封面可以共用。gamelist 里的 name 是人工标好的，
 * 把结尾的「简化版 / 加强版 / 改版…」削掉后名字相同的，就是同一游戏。
 *
 * 用法：node scripts/build-cover-aliases.mjs <gamelist.xml> [输出路径]
 * 产物：server/cover-aliases.json  形如 { "killbldp": "killbld" }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
const OUT = process.argv[3] || path.join(HERE, '..', 'server', 'cover-aliases.json');

if (!SRC || !fs.existsSync(SRC)) {
  console.error('用法: node scripts/build-cover-aliases.mjs <gamelist.xml> [输出路径]');
  process.exit(1);
}

const xml = fs.readFileSync(SRC, 'utf8');
const decode = (s) =>
  String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/** 取 <game> 块里的字段 */
function field(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : '';
}

const games = [];
for (const m of xml.matchAll(/<game>([\s\S]*?)<\/game>/g)) {
  const block = m[1];
  const p = field(block, 'path');
  const name = field(block, 'name');
  const image = field(block, 'image');
  if (!p || !name) continue;
  const fileName = p.split('/').pop();
  const rom = path.basename(fileName, path.extname(fileName)).trim().toLowerCase();
  if (!rom) continue;
  games.push({ rom, name, image, dir: p });
}

/**
 * 削掉结尾的版本词与地区标记，剩下的就是这个游戏的本名。
 * 注意括号里的玩法说明不能削：「泡泡龙1(弹球)」和「泡泡龙1(平台)」是两个游戏，
 * 一刀切掉括号会把它们并成一个，封面就串了。只认地区标记。
 */
const REGION_TAIL =
  /\s*[（(]\s*(世界版?|日版?|美版?|欧版?|亚洲版?|中国版|韩版|港澳版|台湾版|Japan|JPN|JP|USA?|Europe|Euro|Asia|World|Export)\s*[)）]\s*$/i;
const VERSION_TAIL =
  /(简化版|加强版|改版|中文版|盗版|无敌版|无限版|特别版|纪念版|修正版|修改版|美化版|汉化版|hack版)$/i;

function normalizeName(name) {
  let s = String(name || '').trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(REGION_TAIL, '').replace(VERSION_TAIL, '').trim();
    if (s === before) break;
  }
  return s.replace(/\s+/g, ' ');
}

// 归一化后同名的归为一组，组内挑一个「正传」当封面来源
const groups = new Map();
for (const g of games) {
  const key = normalizeName(g.name);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(g);
}

const aliases = {};
const details = [];
for (const [key, list] of groups) {
  const roms = new Set(list.map((g) => g.rom));
  if (roms.size < 2) continue; // 同一短名重复出现，本来就是同一个封面

  // 基准优先级：非 hack 目录 > 有官方 image > 短名更短
  const score = (g) => {
    let s = 0;
    if (!/hack/i.test(g.dir)) s -= 100;
    if (g.image) s -= 20;
    s += g.rom.length;
    return s;
  };
  const base = [...list].sort((a, b) => score(a) - score(b))[0];

  for (const g of list) {
    if (g.rom === base.rom) continue;
    if (aliases[g.rom]) continue; // 先到先得，避免同一条被两组抢
    aliases[g.rom] = base.rom;
    details.push({ game: key, from: g.rom, to: base.rom, fromName: g.name });
  }
}

const payload = {
  source: `gamelist.xml · ${games.length} games`,
  generated: new Date().toISOString().slice(0, 10),
  aliases,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`游戏条目: ${games.length}`);
console.log(`归一化分组: ${groups.size}`);
console.log(`别名条数: ${Object.keys(aliases).length}`);
console.log(`输出: ${path.relative(process.cwd(), OUT)}`);
console.log('\n前 12 条:');
for (const d of details.slice(0, 12)) {
  console.log(`  ${d.from.padEnd(12)} → ${d.to.padEnd(12)} 「${d.fromName}」`);
}
