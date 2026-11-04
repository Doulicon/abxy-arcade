import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { PORT, ROOT_DIR, ADMIN_USERNAME, ADMIN_PASSWORD, ALLOW_REGISTER, EMULATOR_CDN, EMULATOR_DIR, EMULATOR_LOCAL_READY } from './config.js';
import { db, BIOS_DIR, COVER_DIR, ASSET_DIR, ensureAdmin, migrateLegacyPlatformIds } from './db.js';
import { optionalAuth } from './auth.js';
import { safeBiosName } from './upload.js';
import { ensureRomLayout, migrateRomLayout } from './roms.js';
import authRoutes from './routes/auth.js';
import assetRoutes from './routes/assets.js';
import textRoutes from './routes/texts.js';
import gameRoutes from './routes/games.js';

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// 封面图：允许长缓存（文件名带随机后缀）
app.use(
  '/uploads/covers',
  express.static(COVER_DIR, {
    maxAge: '30d',
    immutable: true,
    fallthrough: true,
    index: false,
  }),
);

// 站点素材图：文件名带随机后缀，可长缓存
app.use(
  '/uploads/assets',
  express.static(ASSET_DIR, { maxAge: '30d', immutable: true, fallthrough: true, index: false }),
);

// EmulatorJS 运行时：本地同源托管，避免浏览器走系统代理导致 CDN 加载失败
if (EMULATOR_LOCAL_READY) {
  app.use(
    '/emulatorjs',
    express.static(EMULATOR_DIR, {
      index: false,
      maxAge: '7d',
      setHeaders: (res, filePath) => {
        if (/\.(data|wasm)$/.test(filePath)) {
          res.setHeader('Content-Type', 'application/octet-stream');
        }
      },
    }),
  );
  // 静态文件缺失时明确 404，避免被 SPA 兜底成 index.html 导致脚本解析错误
  app.use('/emulatorjs', (_req, res) => res.status(404).type('text').send('emulator asset not found'));
}

app.use('/api', optionalAuth);
app.use('/api/auth', authRoutes);
app.use('/api', assetRoutes);
app.use('/api', textRoutes);
app.use('/api', gameRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/api/config', (_req, res) => {
  res.json({ allowRegister: ALLOW_REGISTER, emulatorCdn: EMULATOR_CDN, emulatorLocal: EMULATOR_LOCAL_READY });
});

// 未匹配的 API 统一返回 JSON
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

/**
 * 街机 BIOS：EmulatorJS 会把 EJS_biosUrl 原样当成模拟器虚拟文件系统的路径，
 * 所以必须挂在根路径（/neogeo.zip），并且用 Cookie 鉴权（不能带 ?t=，否则文件名会带查询串）。
 * FBNeo 需要完整的 neogeo.zip，页面侧会同时开 EJS_dontExtractBIOS。
 */
app.get('/:file', optionalAuth, (req, res, next) => {
  const name = safeBiosName(req.params.file);
  if (!name) return next();
  const exists = db.prepare('SELECT name FROM bios_files WHERE name = ?').get(name);
  const filePath = path.join(BIOS_DIR, name);
  if (!exists || !fs.existsSync(filePath)) return next();
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath, { headers: { 'Content-Type': 'application/octet-stream' } });
});

const webDist = path.join(ROOT_DIR, 'web', 'dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  // 构建产物带 hash，可长期缓存；index.html 不缓存，保证发版即时生效
  app.use(
    '/assets',
    express.static(path.join(webDist, 'assets'), { maxAge: '1y', immutable: true, index: false }),
  );
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  app.get('*', (_req, res) =>
    res
      .status(200)
      .type('html')
      .send('<h1>前端尚未构建</h1><p>请先执行 <code>npm run build:web</code>，或使用开发模式 <code>npm run dev:web</code>（端口 5173）。</p>'),
  );
}

// 统一错误处理
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? '文件过大（ROM 上限 512MB，封面上限同为 512MB）'
        : `上传失败：${err.message}`;
    return res.status(400).json({ error: msg });
  }
  if (err && err.message) return res.status(400).json({ error: err.message });
  console.error('[server] 未捕获异常', err);
  res.status(500).json({ error: '服务器内部错误' });
});

const created = ensureAdmin();
// 平台 id 改名迁移（nes → fc、snes → sfc）：必须早于任何按平台查询的逻辑
const migrated = migrateLegacyPlatformIds();
if (migrated) console.log(`  ▸ 平台 id 迁移完成：${migrated} 条记录已更新为 fc / sfc`);
// ROM 资源按平台分目录：data/roms/<平台 id>/（含 resources 子目录），老数据自动归位
ensureRomLayout();
migrateRomLayout((msg) => console.log(`  ▸ ${msg}`));
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ▸ ABXY ARCADE 已启动: http://localhost:${PORT}`);
  console.log(`  ▸ 数据目录: ${path.dirname(COVER_DIR)}`);
  if (created) {
    console.log(`  ▸ 已创建管理员账号: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}  —— 请尽快修改密码！`);
  }
  if (!process.env.JWT_SECRET) {
    console.log('  ▸ 提示：生产环境建议通过环境变量 JWT_SECRET 指定固定密钥');
  }
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}
