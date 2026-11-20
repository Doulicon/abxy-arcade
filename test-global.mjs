import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const R = path.join(os.tmpdir(), 'global-cover-test');
fs.rmSync(R, { recursive: true, force: true });
const mk = (p, c = 'x') => {
  const a = path.join(R, p);
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.writeFileSync(a, c);
};

// 全局 shared resources
mk('resources/mslug.jpg', 'global-mslug');
mk('resources/mslug3.png', 'global-mslug3');
mk('resources/killbld.jpg', 'global-killbld');
mk('resources/街机/boxart/batman.jpg', 'global-batman-deep');

// 平台内 resources（应优先于全局）
mk('arcade/resources/mslug.jpg', 'arcade-mslug');

// ROM
mk('arcade/mslug.zip');
mk('arcade/killbldp.zip');      // 别名 -> killbld
mk('neogeo/mslug.zip');         // 同短名，另一个平台，共用全局
mk('neogeo/mslug3.zip');
mk('neogeo/合金弹头系列/mslug4.zip');
mk('neogeo/合金弹头系列/深度/再深/mslug3.zip'); // 深层，考验全局兜底
mk('fc/contra.zip');
mk('fc/batman.zip');            // 只在全局子文件夹里有

const { buildMediaIndex, findCoverSource } = await import('./server/media-covers.js');
const idx = buildMediaIndex(R);

const cases = [
  ['arcade/mslug.zip', 'arcade-mslug', '平台内优先于全局'],
  ['neogeo/mslug.zip', 'global-mslug', '跨平台共用全局'],
  ['arcade/killbldp.zip', 'global-killbld', '别名在全局生效'],
  ['neogeo/mslug3.zip', 'global-mslug3', '全局直接命中'],
  ['neogeo/合金弹头系列/深度/再深/mslug3.zip', 'global-mslug3', '深目录靠全局兜底'],
  ['fc/batman.zip', 'global-batman-deep', '全局子文件夹'],
  ['fc/contra.zip', null, '没有就留空'],
  ['neogeo/合金弹头系列/mslug4.zip', null, '没有就留空'],
];

let pass = 0;
for (const [rom, want, note] of cases) {
  const src = findCoverSource(path.join(R, rom), idx);
  const got = src ? fs.readFileSync(src, 'utf8') : null;
  const ok = want === null ? src === null : got === want;
  if (ok) pass++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${rom.padEnd(42)} -> ${String(got).padEnd(20)} [${note}]`,
  );
}
console.log(`\n${pass}/${cases.length} 通过`);

// 性能：1441 个封面配 1500 个 ROM
const big = path.join(os.tmpdir(), 'global-cover-perf');
fs.rmSync(big, { recursive: true, force: true });
for (let i = 0; i < 1441; i++) {
  const p = path.join(big, 'resources', `rom${i}`, 'boxFront.jpg');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'y');
}
for (let i = 0; i < 1500; i++) {
  const p = path.join(big, ['arcade', 'neogeo', 'fc'][i % 3], `rom${i}.zip`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'z');
}
const t0 = Date.now();
const bidx = buildMediaIndex(big);
let hit = 0;
for (let i = 0; i < 1500; i++) {
  const p = path.join(big, ['arcade', 'neogeo', 'fc'][i % 3], `rom${i}.zip`);
  if (findCoverSource(p, bidx)) hit++;
}
console.log(`\n性能：1500 个 ROM / 1441 张封面，命中 ${hit}，耗时 ${Date.now() - t0} ms`);

fs.rmSync(R, { recursive: true, force: true });
fs.rmSync(big, { recursive: true, force: true });
