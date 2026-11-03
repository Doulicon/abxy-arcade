/**
 * 一次性改名脚本：ENLU / ZXCV → ABXY（品牌名、包名、页面标题等）
 * 运行：node scripts/rename-brand.mjs
 */
import fs from 'node:fs';

const files = [
  ['web/src/components/Layout.tsx', [["|| 'ENLU ARCADE'", "|| 'ABXY ARCADE'"]]],
  ['web/src/pages/Home.tsx', [["|| 'ENLU ARCADE'", "|| 'ABXY ARCADE'"]]],
  ['web/src/pages/Login.tsx', [['>ENLU<', '>ABXY<']]],
  ['server/index.js', [['ENLU ARCADE', 'ABXY ARCADE']]],
  ['web/index.html', [['ENLU ARCADE', 'ABXY ARCADE']]],
  ['package.json', [['"enlu-arcade"', '"abxy-arcade"']]],
  ['web/package.json', [['"enlu-web"', '"abxy-web"']]],
];

for (const [file, pairs] of files) {
  let src = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) src = src.split(from).join(to);
  fs.writeFileSync(file, src);
  console.log('patched', file);
}
