#!/usr/bin/env node
/**
 * 导出 ABXY ARCADE 数据包（用于迁移到 NAS）
 *
 * 做两件事：
 *   1. 用 SQLite 的 VACUUM INTO 生成数据库一致性快照（避免直接拷贝正在写入的 db/wal 文件导致损坏）
 *   2. 打包 roms / covers / bios / assets 目录，以及 .jwt-secret（保留登录态）
 *
 * 用法：node scripts/export-data.mjs [输出目录]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.resolve(process.argv[2] || path.join(ROOT, 'release-data'));

const COPY_DIRS = ['roms', 'covers', 'bios', 'assets'];

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function dirSize(dir) {
  let total = 0;
  const walk = (p) => {
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* 忽略读取失败 */
        }
      }
    }
  };
  walk(dir);
  return total;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
      count += 1;
    }
  }
  return count;
}

function main() {
  console.log('=== ABXY ARCADE 数据导出 ===\n');
  console.log(`源目录   : ${DATA_DIR}`);
  console.log(`输出目录 : ${OUT_DIR}\n`);

  if (!fs.existsSync(path.join(DATA_DIR, 'app.db'))) {
    console.error('[错误] 找不到 data/app.db，请确认在项目根目录下运行。');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const staging = path.join(OUT_DIR, 'data');

  // ---------- 1. 数据库一致性快照 ----------
  console.log('[1/3] 导出数据库快照...');
  const srcDb = new Database(path.join(DATA_DIR, 'app.db'), { readonly: true });
  const dbOut = path.join(staging, 'app.db');
  fs.mkdirSync(staging, { recursive: true });
  if (fs.existsSync(dbOut)) fs.unlinkSync(dbOut);
  srcDb.prepare('VACUUM INTO ?').run(dbOut);
  srcDb.close();
  const dbSize = fs.statSync(dbOut).size;
  console.log(`      → app.db（${fmtSize(dbSize)}，VACUUM INTO 一致性快照）`);

  // ---------- 2. 业务数据目录 ----------
  console.log('[2/3] 复制游戏数据目录...');
  for (const dir of COPY_DIRS) {
    const src = path.join(DATA_DIR, dir);
    if (!fs.existsSync(src)) {
      console.log(`      · ${dir}：不存在，跳过`);
      continue;
    }
    const dest = path.join(staging, dir);
    const n = copyDir(src, dest);
    console.log(`      → ${dir}：${n} 个文件（${fmtSize(dirSize(dest))}）`);
  }

  // ---------- 3. JWT 密钥（保留登录态） ----------
  console.log('[3/3] 复制 JWT 密钥...');
  const secret = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(secret)) {
    fs.copyFileSync(secret, path.join(staging, '.jwt-secret'));
    console.log('      → .jwt-secret（保留现有登录态）');
  } else {
    console.log('      · .jwt-secret 不存在，NAS 首次启动将自动生成');
  }

  // ---------- 输出说明文件 ----------
  const manifest = {
    exportedAt: new Date().toISOString(),
    database: 'app.db',
    directories: COPY_DIRS,
    sizeBytes: dirSize(staging),
    includesJwtSecret: fs.existsSync(path.join(staging, '.jwt-secret')),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const readme = `# ABXY ARCADE 数据包

导出时间：${new Date().toISOString()}
总大小  ：${fmtSize(manifest.sizeBytes)}

## 内容

- \`data/app.db\`   —— SQLite 数据库（用户、游戏、系列、配置等全部业务数据）
- \`data/roms/\`   —— 游戏 ROM 文件
- \`data/covers/\` —— 游戏封面
- \`data/bios/\`   —— BIOS 文件
- \`data/assets/\` —— 站点资源
- \`data/.jwt-secret\` —— JWT 密钥（${manifest.includesJwtSecret ? '已包含，登录态可延续' : '未包含'}）

## 在 NAS 上恢复

\`\`\`bash
# 1. 先确保容器已停止（避免文件占用）
docker compose down

# 2. 备份 NAS 上现有的数据目录（若有）
sudo mv data data.bak.\$(date +%Y%m%d) 2>/dev/null || true

# 3. 解压并覆盖到数据目录
tar -xzf abxy-data.tar.gz -C /path/to/abxy-arcade/

# 4. 修正属主，让容器内 node 用户可写（飞牛 fnOS 示例）
sudo chown -R 1000:1001 data

# 5. 启动
docker compose up -d
\`\`\`
`;
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme);

  console.log(`\n=== 导出完成 ===`);
  console.log(`输出目录: ${OUT_DIR}`);
  console.log(`总大小  : ${fmtSize(manifest.sizeBytes)}`);
}

main();
