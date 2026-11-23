import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db, COVER_DIR, BIOS_DIR, ROM_DIR } from '../db.js';
import { lookupGameMeta } from '../game-meta.js';
import {
  buildMediaIndex,
  findCoverSource,
  importCover,
  coverExists,
  coverFingerprint,
} from '../media-covers.js';
import { PLATFORMS, PLATFORM_MAP, guessPlatform } from '../platforms.js';
import {
  saveRom,
  resolveRomPath,
  listRomCandidates,
  relocateRom,
  titleFromFileName,
  ensureRomLayout,
  hasBios,
  relRomPath,
} from '../roms.js';
import { authRequired, adminRequired } from '../auth.js';
import {
  gameUpload,
  biosUpload,
  seriesUpload,
  moveCover,
  moveBios,
  safeBiosName,
  decodeOriginalName,
  removeFileQuietly,
  cleanupTmp,
} from '../upload.js';

const router = express.Router();

/**
 * 排序规则：所有排序都先尊重手动权重（weight 越大越靠前），
 * 权重相同时再按各自的规则排，这样管理员置顶的内容在任何排序下都在前面。
 */
const SORTS = {
  latest: 'g.weight DESC, g.created_at DESC, g.id DESC',
  hot: 'g.weight DESC, g.play_count DESC, g.id DESC',
  title: 'g.weight DESC, g.title ASC',
  year: 'g.weight DESC, g.year DESC, g.id DESC',
  favorites:
    'g.weight DESC, (SELECT COUNT(*) FROM favorites f2 WHERE f2.game_id = g.id) DESC, g.id DESC',
};

/** 街机内核按压缩包名识别 romset，所以 URL 末段用原始文件名而不是随机名 */
function safeRomName(name, fallback) {
  const base = String(name || '')
    .replace(/[^\w.\-]/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 96);
  return /\.[A-Za-z0-9]{1,8}$/.test(base) ? base : fallback;
}

function toGame(row) {
  const platform = PLATFORM_MAP.get(row.platform);
  // rom_file 记着路径但文件已不在磁盘：保留全部资料，只把状态标成「缺 ROM」
  const romMissing = !!row.rom_file && !!row.rom_missing;
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    platformName: platform ? platform.name : row.platform,
    platformShort: platform ? platform.short : String(row.platform).toUpperCase(),
    platformColor: platform ? platform.color : '#FB7299',
    emulatorCore: platform ? platform.emulatorCore : row.platform,
    description: row.description,
    cover: row.cover,
    // 'manual' = 玩家自己上传/填的封面；'auto' = 扫描自动匹配的默认封面
    coverSource: row.cover_source || '',
    year: row.year,
    developer: row.developer,
    publisher: row.publisher,
    genre: row.genre,
    players: row.players,
    playCount: row.play_count,
    featured: !!row.featured,
    weight: Number(row.weight) || 0,
    hasRom: !!row.rom_file && !romMissing,
    romMissing,
    romName: row.rom_name || '',
    romSize: row.rom_size || 0,
    // 街机内核按 URL 末段判断压缩包类型，所以 ROM 地址必须带 .zip 后缀
    romUrl:
      row.rom_file && !romMissing
        ? `/api/games/${row.id}/rom/${encodeURIComponent(safeRomName(row.rom_name, row.rom_file))}`
        : '',
    core: row.core || (platform ? platform.core : ''),
    biosName: row.bios_name || '',
    needsBios: !!(platform && platform.bios),
    favCount: row.fav_count || 0,
    isFavorite: !!row.is_fav,
    seriesId: row.series_id ?? null,
    seriesName: row.series_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const GAME_COLUMNS = `
  g.*,
  (SELECT COUNT(*) FROM favorites f2 WHERE f2.game_id = g.id) AS fav_count,
  EXISTS(SELECT 1 FROM favorites f WHERE f.game_id = g.id AND f.user_id = @uid) AS is_fav,
  (SELECT s.name FROM series s WHERE s.id = g.series_id) AS series_name
`;

/* ------------------------------ 公共接口 ------------------------------ */

/** 平台权重表：没有记录的平台视为 0（按内置顺序靠后） */
function platformWeights() {
  const rows = db.prepare('SELECT platform_id, weight FROM platform_weights').all();
  return new Map(rows.map((r) => [r.platform_id, Number(r.weight) || 0]));
}

/** 按权重降序排平台；权重相同保持内置顺序（ECS 等早期机器在前） */
function sortPlatforms(list, weights) {
  return list
    .map((p, i) => ({ p, i, w: weights.get(p.id) || 0 }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.p);
}

router.get('/platforms', (_req, res) => {
  const counts = db.prepare('SELECT platform, COUNT(*) AS n FROM games GROUP BY platform').all();
  const map = new Map(counts.map((r) => [r.platform, r.n]));
  const weights = platformWeights();
  res.json({
    items: sortPlatforms(PLATFORMS, weights).map((p) => ({
      ...p,
      weight: weights.get(p.id) || 0,
      count: map.get(p.id) || 0,
    })),
    total: counts.reduce((s, r) => s + r.n, 0),
  });
});

/** 首页聚合：按平台分区的横向卡片 + 最近上架 + 系列，一次请求拿全 */
router.get('/home', (req, res) => {
  const uid = req.user ? req.user.id : 0;
  // 平台分区统计：只统计「不属于系列」的游戏（系列游戏由系列卡片统一承载）
  const counts = new Map(
    db
      .prepare('SELECT platform, COUNT(*) AS n FROM games WHERE series_id IS NULL GROUP BY platform')
      .all()
      .map((r) => [r.platform, r.n]),
  );
  const weights = platformWeights();
  const ordered = sortPlatforms(PLATFORMS, weights);
  const stmt = db.prepare(
    `SELECT ${GAME_COLUMNS} FROM games g
     WHERE g.platform = @platform AND g.series_id IS NULL
     ORDER BY g.weight DESC, g.featured DESC, g.play_count DESC, g.id DESC LIMIT 12`,
  );

  const sections = [];
  for (const p of ordered) {
    const count = counts.get(p.id) || 0;
    if (!count) continue;
    sections.push({
      id: p.id,
      name: p.name,
      short: p.short,
      color: p.color,
      weight: weights.get(p.id) || 0,
      count,
      items: stmt.all({ uid, platform: p.id }).map(toGame),
    });
  }

  const latest = db
    .prepare(
      `SELECT ${GAME_COLUMNS} FROM games g
       WHERE g.series_id IS NULL
       ORDER BY g.weight DESC, g.created_at DESC, g.id DESC LIMIT 8`,
    )
    .all({ uid })
    .map(toGame);

  // 系列：按权重降序，含游戏数（含 featured 标记）
  const series = db
    .prepare(`SELECT ${SERIES_SELECT} FROM series s ORDER BY s.weight DESC, s.id ASC`)
    .all()
    .map(toSeries);

  // 首页精选：只返回真正设为精选的「无系列游戏」与「精选系列」，供前端精选推荐区使用
  const featuredGames = db
    .prepare(
      `SELECT ${GAME_COLUMNS} FROM games g
       WHERE g.featured = 1 AND g.series_id IS NULL
       ORDER BY g.weight DESC, g.play_count DESC, g.id DESC LIMIT 12`,
    )
    .all({ uid })
    .map(toGame);
  const featuredSeries = series.filter((s) => s.featured).slice(0, 12);

  res.json({
    // 平台卡片用：展示全部支持的平台（含暂无游戏的），空平台由前端显示「暂无游戏」标识
    platforms: ordered.map((p) => ({
      id: p.id,
      short: p.short,
      color: p.color,
      weight: weights.get(p.id) || 0,
      count: counts.get(p.id) || 0,
    })),
    sections,
    latest,
    series,
    featuredGames,
    featuredSeries,
    total: [...counts.values()].reduce((a, b) => a + b, 0),
  });
});

router.get('/games', (req, res) => {
  const uid = req.user ? req.user.id : 0;
  const q = String(req.query.q || '').trim();
  const platform = String(req.query.platform || '').trim();
  const genre = String(req.query.genre || '').trim();
  const sortKey = String(req.query.sort || 'latest');
  const sort = SORTS[sortKey] ? sortKey : 'latest';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(48, Math.max(1, Number(req.query.pageSize) || 24));

  const where = [];
  const params = { uid };
  if (q) {
    where.push('(g.title LIKE @q OR g.developer LIKE @q OR g.publisher LIKE @q OR g.genre LIKE @q)');
    params.q = `%${q}%`;
  }
  if (platform) {
    where.push('g.platform = @platform');
    params.platform = platform;
  }
  if (genre) {
    where.push('g.genre = @genre');
    params.genre = genre;
  }
  if (req.query.featured === '1') where.push('g.featured = 1');
  if (req.query.playable === '1') where.push("g.rom_file <> '' AND g.rom_missing = 0");
  // 属于系列的游戏不单独出现在列表里（由系列卡片统一承载）
  where.push('g.series_id IS NULL');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM games g ${whereSql}`).get(params).n;
  const rows = db
    .prepare(
      `SELECT ${GAME_COLUMNS} FROM games g ${whereSql}
       ORDER BY ${SORTS[sort]} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({
    items: rows.map(toGame),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.get('/games/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: '无效的游戏 ID' });
  const uid = req.user ? req.user.id : 0;

  const row = db.prepare(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = @id`).get({ id, uid });
  if (!row) return res.status(404).json({ error: '游戏不存在' });

  // 相关推荐只推「不属于系列」的游戏（系列内游戏由系列卡片统一承载，不单独出现在推荐位）
  const related = db
    .prepare(
      `SELECT ${GAME_COLUMNS} FROM games g
       WHERE g.platform = @platform AND g.id <> @id AND g.series_id IS NULL
       ORDER BY g.play_count DESC LIMIT 6`,
    )
    .all({ platform: row.platform, id, uid });

  res.json({ game: toGame(row), related: related.map(toGame) });
});

/* ------------------------------ 系列 ------------------------------ */

function toSeries(row) {
  const platform = PLATFORM_MAP.get(row.platform);
  return {
    id: row.id,
    name: row.name,
    cover: row.cover,
    description: row.description,
    genre: row.genre,
    platform: row.platform || '',
    platformShort: platform ? platform.short : '',
    platformColor: platform ? platform.color : '#FB7299',
    weight: Number(row.weight) || 0,
    featured: !!row.featured,
    gameCount: row.game_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SERIES_SELECT = `
  s.*,
  (SELECT COUNT(*) FROM games g WHERE g.series_id = s.id) AS game_count
`;

/** 公共：系列列表（含游戏数，按权重降序）；支持 platform 过滤 */
router.get('/series', (req, res) => {
  const platform = String(req.query.platform || '').trim();
  let where = '';
  const params = {};
  if (platform) {
    where = 'WHERE s.platform = @platform';
    params.platform = platform;
  }
  const rows = db
    .prepare(`SELECT ${SERIES_SELECT} FROM series s ${where} ORDER BY s.weight DESC, s.id ASC`)
    .all(params);
  res.json({ items: rows.map(toSeries) });
});

/** 公共：系列详情，返回系列信息 + 该系列下所有游戏 */
router.get('/series/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: '无效的系列 ID' });
  const uid = req.user ? req.user.id : 0;

  const row = db.prepare(`SELECT ${SERIES_SELECT} FROM series s WHERE s.id = @id`).get({ id });
  if (!row) return res.status(404).json({ error: '系列不存在' });

  const games = db
    .prepare(
      `SELECT ${GAME_COLUMNS} FROM games g
       WHERE g.series_id = @id
       ORDER BY g.weight DESC, g.year DESC, g.id ASC`,
    )
    .all({ id, uid })
    .map(toGame);

  res.json({ series: toSeries(row), games });
});

/** ROM 下载：需要登录，支持 cookie / Bearer / ?t= 三种凭证 */
function sendRom(req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT title, rom_file, rom_missing FROM games WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '游戏不存在' });
  if (!row.rom_file) return res.status(409).json({ error: '该游戏还没有上传 ROM' });
  if (row.rom_missing) {
    return res.status(409).json({ error: 'ROM 文件暂时丢失，请管理员放回 data/roms/ 后重新扫描' });
  }
  // URL 末段只是给模拟器用的文件名（街机靠它匹配 romset），真实路径仍以数据库为准
  if (req.params.file && !/^[A-Za-z0-9._%\-]{1,160}$/.test(req.params.file)) {
    return res.status(400).json({ error: '无效的 ROM 文件名' });
  }

  const filePath = resolveRomPath(row.rom_file);
  if (!filePath) {
    return res.status(404).json({ error: 'ROM 文件已丢失，请联系管理员' });
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath, { headers: { 'Content-Type': 'application/octet-stream' } });
}

router.get('/games/:id/rom', authRequired, sendRom);
router.get('/games/:id/rom/:file', authRequired, sendRom);

/** BIOS（街机必备，如 neogeo.zip）：同样需要登录 */
router.get('/bios/:name', authRequired, (req, res) => {
  const name = safeBiosName(req.params.name);
  if (!name) return res.status(400).json({ error: '无效的 BIOS 文件名' });

  const exists = db.prepare('SELECT name FROM bios_files WHERE name = ?').get(name);
  const filePath = path.join(BIOS_DIR, name);
  if (!exists || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: `BIOS ${name} 尚未上传，请联系管理员` });
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath, { headers: { 'Content-Type': 'application/octet-stream' } });
});

router.post('/games/:id/play', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const game = db.prepare('SELECT id FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  // 同一用户 60 秒内重复进入只算一次
  const recent = db
    .prepare(
      `SELECT id FROM plays WHERE user_id = ? AND game_id = ?
       AND created_at > datetime('now', '-60 seconds') LIMIT 1`,
    )
    .get(req.user.id, id);

  if (!recent) {
    db.prepare('INSERT INTO plays (user_id, game_id) VALUES (?, ?)').run(req.user.id, id);
    db.prepare('UPDATE games SET play_count = play_count + 1 WHERE id = ?').run(id);
  }
  const { play_count: playCount } = db
    .prepare('SELECT play_count FROM games WHERE id = ?')
    .get(id);
  res.json({ ok: true, playCount });
});

router.post('/games/:id/favorite', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const game = db.prepare('SELECT id FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: '游戏不存在' });

  const existing = db
    .prepare('SELECT 1 AS x FROM favorites WHERE user_id = ? AND game_id = ?')
    .get(req.user.id, id);

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND game_id = ?').run(req.user.id, id);
  } else {
    db.prepare('INSERT INTO favorites (user_id, game_id) VALUES (?, ?)').run(req.user.id, id);
  }

  const favCount = db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE game_id = ?').get(id).n;
  res.json({ favorited: !existing, favCount });
});

router.get('/me/favorites', authRequired, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(48, Math.max(1, Number(req.query.pageSize) || 24));
  const uid = req.user.id;

  const total = db
    .prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?')
    .get(uid).n;
  const rows = db
    .prepare(
      `SELECT ${GAME_COLUMNS}, f.created_at AS fav_at
       FROM favorites f JOIN games g ON g.id = f.game_id
       WHERE f.user_id = @uid
       ORDER BY f.created_at DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ uid, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({
    items: rows.map((r) => ({ ...toGame(r), favoritedAt: r.fav_at })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.get('/me/recent', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT ${GAME_COLUMNS}, MAX(p.created_at) AS played_at
       FROM plays p JOIN games g ON g.id = p.game_id
       WHERE p.user_id = @uid
       GROUP BY g.id ORDER BY played_at DESC LIMIT 12`,
    )
    .all({ uid: req.user.id });
  res.json({ items: rows.map((r) => ({ ...toGame(r), playedAt: r.played_at })) });
});

/* ------------------------------ 管理接口 ------------------------------ */

const LIMITS = { title: 90, developer: 60, publisher: 60, genre: 30, description: 5000 };

/** 后台游戏列表：包含「属于系列」的游戏（前台列表会隐藏系列内游戏，后台需要能管理它们） */
router.get('/admin/games', adminRequired, (req, res) => {
  const q = String(req.query.q || '').trim();
  const platform = String(req.query.platform || '').trim();
  // series=none → 只看没归入任何系列的游戏；series=<id> → 看指定系列
  const series = String(req.query.series || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 15));
  const sortKey = String(req.query.sort || 'latest');
  const sort = SORTS[sortKey] ? sortKey : 'latest';

  const where = [];
  const params = { uid: req.user.id };
  if (q) {
    where.push('(g.title LIKE @q OR g.developer LIKE @q OR g.publisher LIKE @q OR g.genre LIKE @q)');
    params.q = `%${q}%`;
  }
  if (platform) {
    where.push('g.platform = @platform');
    params.platform = platform;
  }
  if (series === 'none') {
    where.push('g.series_id IS NULL');
  } else if (series) {
    where.push('g.series_id = @series');
    params.series = Number(series);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM games g ${whereSql}`).get(params).n;
  const rows = db
    .prepare(
      `SELECT ${GAME_COLUMNS} FROM games g ${whereSql}
       ORDER BY ${SORTS[sort]} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({
    items: rows.map(toGame),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/**
 * @param body      表单原始字段
 * @param base      编辑时的旧值
 * @param romHint   本次上传的 ROM 原始文件名（用于「没填信息就按文件名走默认值」）
 */
function parsePayload(body, base = {}, romHint = '') {
  const str = (key, max) => {
    if (body[key] === undefined) return base[key] ?? '';
    return String(body[key]).trim().slice(0, max);
  };

  // 管理员直接丢 ROM、没填名称：用文件名（不含扩展名）当默认名称
  let title = str('title', LIMITS.title);
  if (!title) title = titleFromFileName(romHint);
  if (!title) throw new Error('游戏名称不能为空');

  // 没选平台：按扩展名自动识别（zip 默认街机）
  let platform = String(body.platform ?? '').trim() || String(base.platform ?? '').trim();
  if (!platform) platform = guessPlatform(romHint) || '';
  if (!PLATFORM_MAP.has(platform)) {
    throw new Error('请选择游戏平台；或上传后缀能识别的 ROM（.nes/.sfc/.gba/.zip…）让系统自动判断');
  }

  const platformInfo = PLATFORM_MAP.get(platform);
  const allowedCores =
    platformInfo.cores && platformInfo.cores.length ? platformInfo.cores : [platformInfo.core];

  let core = String(body.core ?? '').trim();
  if (!core) core = platform === base.platform && base.core ? base.core : platformInfo.core;
  if (!allowedCores.includes(core)) {
    throw new Error(`${platformInfo.name} 可用的模拟器核心：${allowedCores.join(' / ')}`);
  }

  const biosName =
    body.biosName === undefined ? String(base.biosName ?? '') : String(body.biosName).trim();
  if (biosName) {
    const known = safeBiosName(biosName) && db.prepare('SELECT 1 AS x FROM bios_files WHERE name = ?').get(biosName);
    if (!known) throw new Error(`BIOS「${biosName}」不存在，请先在「BIOS 管理」里上传`);
  }
  if (platformInfo.bios && !biosName) {
    throw new Error(`${platformInfo.name} 必须挂载 BIOS，请先上传 ${platformInfo.bios} 再选择`);
  }

  let year = base.year ?? null;
  if (body.year !== undefined) {
    const raw = String(body.year).trim();
    if (!raw) year = null;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1958 || n > 2100) throw new Error('发售年份需在 1958-2100 之间');
      year = n;
    }
  }

  let players = base.players ?? 1;
  if (body.players !== undefined) {
    const n = Number(body.players);
    if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error('游玩人数需在 1-8 之间');
    players = n;
  }

  // 权重：数字越大越靠前，允许负数（可用于压到后面），0 = 默认
  let weight = Number(base.weight) || 0;
  if (body.weight !== undefined) {
    const raw = String(body.weight).trim();
    if (!raw) weight = 0;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || Math.abs(n) > 9999) throw new Error('权重需为 -9999 到 9999 的整数');
      weight = n;
    }
  }

  const coverUrl = String(body.coverUrl ?? '').trim();
  if (coverUrl && !/^https?:\/\//i.test(coverUrl) && !coverUrl.startsWith('/uploads/')) {
    throw new Error('封面链接需以 http(s):// 开头');
  }

  // 所属系列：空 = 不属于任何系列；非法/不存在的系列拒绝；系列指定了平台则游戏必须同平台
  let seriesId = base.seriesId ?? null;
  if (body.seriesId !== undefined) {
    const raw = String(body.seriesId).trim();
    if (!raw) {
      seriesId = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) throw new Error('系列参数无效');
      const exists = db.prepare('SELECT 1 AS x, platform FROM series WHERE id = ?').get(n);
      if (!exists) throw new Error('所选系列不存在，请先在「系列管理」里创建');
      if (exists.platform && exists.platform !== platform) {
        const sp = PLATFORM_MAP.get(exists.platform);
        throw new Error(`系列「${sp ? sp.name : exists.platform}」只允许包含 ${sp ? sp.name : exists.platform} 平台的游戏，当前游戏平台不一致`);
      }
      seriesId = n;
    }
  }

  return {
    title,
    platform,
    description: str('description', LIMITS.description),
    year,
    developer: str('developer', LIMITS.developer),
    publisher: str('publisher', LIMITS.publisher),
    genre: str('genre', LIMITS.genre),
    players,
    weight,
    featured: String(body.featured ?? base.featured ?? 0) === '1' ? 1 : 0,
    coverUrl,
    core,
    biosName,
    seriesId,
  };
}

function removeCoverFile(cover) {
  if (cover && cover.startsWith('/uploads/covers/')) {
    removeFileQuietly(path.join(COVER_DIR, path.basename(cover)));
  }
}

/**
 * 把内置资料库里匹配到的信息填进表单字段。
 * 只填名称和简介——年份/厂商/类型这套数据里有不少脏值（"n/a"、把厂商名填进类型），
 * 不如留空让管理员填。填过的内容一律不动。
 * @param {Object} body 表单对象（会被就地修改）
 * @param {ReturnType<typeof lookupGameMeta>} meta
 */
function fillBodyFromMeta(body, meta) {
  if (!meta) return;
  const blank = (v) => String(v ?? '').trim() === '';
  if (blank(body.title) && meta.title) body.title = meta.title;
  if (blank(body.description) && meta.description) body.description = meta.description;
}

/**
 * 扫描已登记条目时算新资料：名称仍是默认文件名才替换，简介空着才补。
 * 管理员/玩家改过的内容一概不覆盖。
 */
function mergeMeta(row, meta, defaultTitle) {
  return {
    title: meta && meta.title && row.title === defaultTitle ? meta.title : row.title,
    description: meta && !row.description ? meta.description : row.description,
  };
}

/**
 * 从 ROM 旁边的 resources/ 里取同名图片当封面。
 * @param {string} romAbsPath ROM 绝对路径
 * @param {Object} [index] 批量场景下复用 buildMediaIndex() 的结果
 * @returns {{url: string, key: string}|null} 没找到返回 null
 */
function coverFromMedia(romAbsPath, index) {
  const src = findCoverSource(romAbsPath, index);
  if (!src) return null;
  return {
    url: importCover(src, path.basename(romAbsPath, path.extname(romAbsPath))),
    key: coverFingerprint(src),
  };
}

router.post('/admin/games', adminRequired, gameUpload, (req, res) => {
  const files = req.files || {};
  const coverFile = files.cover && files.cover[0];
  const romFile = files.rom && files.rom[0];
  try {
    if (!romFile) throw new Error('请上传游戏 ROM 文件');
    const originalName = decodeOriginalName(romFile.originalname);

    // 街机短名（mslug.zip）换成中文名 + 简介；各平台的资料库也在这里匹配。
    // 管理员填过的字段一律不覆盖，只补空缺。
    const body = { ...req.body };
    const guessId = String(body.platform ?? '').trim() || guessPlatform(originalName) || '';
    fillBodyFromMeta(body, lookupGameMeta(originalName, guessId));
    const data = parsePayload(body, {}, originalName);

    // ROM 落到 data/roms/<平台 id>/ 下，顺便校验格式与 romset 命名
    const saved = saveRom(romFile.path, originalName, data.platform);
    // 封面优先级：玩家上传的图 > 玩家填的 URL > resources 里自动匹配的默认图
    let cover = data.coverUrl;
    let coverSource = cover ? 'manual' : '';
    let coverKey = '';
    if (coverFile) {
      removeCoverFile(cover);
      cover = moveCover(coverFile.path, decodeOriginalName(coverFile.originalname));
      coverSource = 'manual';
    } else if (!cover) {
      // 没传封面：试着从 ROM 同级的 resources/ 里捡一张
      const romAbs = path.join(ROM_DIR, saved.romFile);
      const auto = coverFromMedia(romAbs) || coverFromMedia(romAbs, buildMediaIndex());
      if (auto) {
        cover = auto.url;
        coverSource = 'auto';
        coverKey = auto.key;
      }
    }

    const info = db
      .prepare(
        `INSERT INTO games (title, platform, description, cover, cover_source, cover_auto_key,
          rom_file, rom_name, rom_size,
          core, bios_name, year, developer, publisher, genre, players, featured, weight, series_id)
         VALUES (@title, @platform, @description, @cover, @coverSource, @coverKey, @romFile, @romName, @romSize,
          @core, @biosName, @year, @developer, @publisher, @genre, @players, @featured, @weight, @seriesId)`,
      )
      .run({
        ...data,
        cover,
        coverSource,
        coverKey,
        romFile: saved.romFile,
        romName: saved.romName,
        romSize: saved.size,
      });

    const row = db
      .prepare(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = @id`)
      .get({ id: info.lastInsertRowid, uid: 0 });
    res.status(201).json({ game: toGame(row) });
  } catch (err) {
    cleanupTmp(req.files);
    res.status(400).json({ error: err.message || '创建失败' });
  }
});

router.put('/admin/games/:id', adminRequired, gameUpload, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!current) {
    cleanupTmp(req.files);
    return res.status(404).json({ error: '游戏不存在' });
  }

  const files = req.files || {};
  const coverFile = files.cover && files.cover[0];
  const romFile = files.rom && files.rom[0];
  // 只有客户端显式传了 coverUrl 才动封面，避免接口调用时误清空已有封面
  const coverProvided = req.body.coverUrl !== undefined;

  try {
    const data = parsePayload(req.body, {
      title: current.title,
      platform: current.platform,
      description: current.description,
      year: current.year,
      developer: current.developer,
      publisher: current.publisher,
      genre: current.genre,
      players: current.players,
      featured: current.featured,
      core: current.core,
      biosName: current.bios_name,
      seriesId: current.series_id,
    });

    let romFileName = current.rom_file;
    let romName = current.rom_name;
    let romSize = current.rom_size;

    if (romFile) {
      const originalName = decodeOriginalName(romFile.originalname);
      const saved = saveRom(romFile.path, originalName, data.platform);
      const oldPath = resolveRomPath(current.rom_file);
      removeFileQuietly(oldPath);
      romFileName = saved.romFile;
      romName = saved.romName;
      romSize = saved.size;
    } else if (data.platform !== current.platform) {
      // 仅换平台时校验已有 ROM 后缀是否兼容，并把文件挪到新平台目录
      const oldPath = resolveRomPath(current.rom_file);
      const ext = path.extname(current.rom_file).toLowerCase();
      if (current.rom_file) {
        const allowed = PLATFORM_MAP.get(data.platform).exts;
        if (!allowed.includes(ext)) {
          throw new Error(`当前 ROM 为 ${ext || '未知'} 格式，新平台不支持，请同时上传新的 ROM`);
        }
        if (oldPath) {
          const newRel = relRomPath(data.platform, path.basename(oldPath));
          if (newRel !== current.rom_file) {
            romFileName = relocateRom(oldPath, data.platform);
          }
        }
      }
    }

    // 封面优先级：玩家上传的图 > 玩家填的 URL > 数据库里原有的（自动匹配的会被扫描刷新）
    let cover = current.cover;
    let coverSource = current.cover_source || '';
    let coverKey = current.cover_auto_key || '';
    if (coverFile) {
      cover = moveCover(coverFile.path, decodeOriginalName(coverFile.originalname));
      removeCoverFile(current.cover);
      coverSource = 'manual';
      coverKey = '';
    } else if (coverProvided && data.coverUrl !== current.cover) {
      removeCoverFile(current.cover);
      cover = data.coverUrl;
      coverSource = cover ? 'manual' : '';
      coverKey = '';
    }

    db.prepare(
      `UPDATE games SET title=@title, platform=@platform, description=@description, cover=@cover,
        cover_source=@coverSource, cover_auto_key=@coverKey,
        rom_file=@romFile, rom_name=@romName, rom_size=@romSize, rom_missing=0, core=@core, bios_name=@biosName,
        year=@year, developer=@developer, publisher=@publisher, genre=@genre, players=@players,
        featured=@featured, weight=@weight, series_id=@seriesId, updated_at=datetime('now')
       WHERE id=@id`,
    ).run({
      ...data,
      id,
      cover,
      coverSource,
      coverKey,
      romFile: romFileName,
      romName,
      romSize,
    });

    const row = db
      .prepare(`SELECT ${GAME_COLUMNS} FROM games g WHERE g.id = @id`)
      .get({ id, uid: 0 });
    res.json({ game: toGame(row) });
  } catch (err) {
    cleanupTmp(req.files);
    res.status(400).json({ error: err.message || '保存失败' });
  }
});

router.delete('/admin/games/:id', adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '游戏不存在' });

  db.prepare('DELETE FROM games WHERE id = ?').run(id);
  removeFileQuietly(resolveRomPath(row.rom_file));
  removeCoverFile(row.cover);
  res.json({ ok: true });
});

/** 批量删除：body 传 { ids: number[] }，逐个删库 + 清理 ROM/封面文件 */
router.post('/admin/games/batch-delete', adminRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (!ids.length) return res.status(400).json({ error: '请选择要删除的游戏' });

  const del = db.prepare('DELETE FROM games WHERE id = ?');
  const get = db.prepare('SELECT rom_file, cover FROM games WHERE id = ?');
  const removed = [];
  let count = 0;
  for (const id of ids) {
    const row = get.get(id);
    if (!row) continue;
    del.run(id);
    removeFileQuietly(resolveRomPath(row.rom_file));
    removeCoverFile(row.cover);
    removed.push(id);
    count += 1;
  }
  res.json({ ok: true, removed: count, ids: removed });
});

/**
 * 批量归类到系列：body { ids: number[], seriesId: number|null }
 * seriesId 为空 = 批量脱离系列；指定时校验系列存在且所有游戏平台一致。
 */
router.post('/admin/games/batch-series', adminRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (!ids.length) return res.status(400).json({ error: '请选择要归类的游戏' });

  // seriesId 为空 → 脱离系列
  const rawSeries = req.body?.seriesId;
  let seriesId = null;
  let series = null;
  if (rawSeries !== undefined && rawSeries !== null && String(rawSeries).trim() !== '') {
    const n = Number(rawSeries);
    if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: '系列参数无效' });
    series = db.prepare('SELECT * FROM series WHERE id = ?').get(n);
    if (!series) return res.status(400).json({ error: '所选系列不存在' });
    seriesId = n;
  }

  // 系列指定了平台 → 所选游戏必须全部同平台
  if (series && series.platform) {
    const bad = db
      .prepare(
        `SELECT id, title FROM games WHERE id IN (${ids.map(() => '?').join(',')})
         AND platform <> ?`,
      )
      .all(...ids, series.platform);
    if (bad.length) {
      const sp = PLATFORM_MAP.get(series.platform);
      const pname = sp ? sp.name : series.platform;
      const titles = bad.slice(0, 3).map((b) => b.title).join('、');
      return res.status(400).json({
        error: `系列「${series.name}」只允许包含 ${pname} 平台的游戏，以下 ${bad.length} 个游戏平台不一致：${titles}${bad.length > 3 ? ' 等' : ''}`,
      });
    }
  }

  const upd = db.prepare("UPDATE games SET series_id = ?, updated_at = datetime('now') WHERE id = ?");
  const tx = db.transaction(() => {
    for (const id of ids) upd.run(seriesId, id);
  });
  tx();
  res.json({ ok: true, updated: ids.length, seriesId });
});

/** 行内快速改权重：数字越大越靠前 */
router.patch('/admin/games/:id/weight', adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const raw = String(req.body?.weight ?? '').trim();
  const weight = raw === '' ? 0 : Number(raw);
  if (!Number.isInteger(weight) || Math.abs(weight) > 9999) {
    return res.status(400).json({ error: '权重需为 -9999 到 9999 的整数' });
  }
  const info = db
    .prepare("UPDATE games SET weight = ?, updated_at = datetime('now') WHERE id = ?")
    .run(weight, id);
  if (!info.changes) return res.status(404).json({ error: '游戏不存在' });
  res.json({ ok: true, id, weight });
});

/* ------------------------------ 系列管理 ------------------------------ */

const SERIES_LIMITS = { name: 90, genre: 30, description: 2000 };

/** 解析系列表单字段（编辑时 base 提供旧值） */
function parseSeries(body, base = {}) {
  const str = (key, max) => {
    if (body[key] === undefined) return base[key] ?? '';
    return String(body[key]).trim().slice(0, max);
  };
  const name = str('name', SERIES_LIMITS.name);
  if (!name) throw new Error('系列名称不能为空');

  let weight = Number(base.weight) || 0;
  if (body.weight !== undefined) {
    const raw = String(body.weight).trim();
    if (!raw) weight = 0;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || Math.abs(n) > 9999) throw new Error('权重需为 -9999 到 9999 的整数');
      weight = n;
    }
  }

  const coverUrl = String(body.coverUrl ?? '').trim();
  if (coverUrl && !/^https?:\/\//i.test(coverUrl) && !coverUrl.startsWith('/uploads/')) {
    throw new Error('封面链接需以 http(s):// 开头');
  }

  // 所属平台：空 = 不限；指定后系列内游戏必须同平台
  let platform = base.platform ?? '';
  if (body.platform !== undefined) {
    platform = String(body.platform).trim();
    if (platform && !PLATFORM_MAP.has(platform)) throw new Error('所选平台无效');
  }

  // 是否设为首页精选
  const featured = body.featured === undefined
    ? (base.featured ? 1 : 0)
    : (String(body.featured) === '1' || String(body.featured) === 'true' ? 1 : 0);

  return {
    name,
    cover: coverUrl,
    description: str('description', SERIES_LIMITS.description),
    genre: str('genre', SERIES_LIMITS.genre),
    platform,
    weight,
    featured,
  };
}

/** 后台：系列列表（含游戏数） */
router.get('/admin/series', adminRequired, (_req, res) => {
  const rows = db
    .prepare(`SELECT ${SERIES_SELECT} FROM series s ORDER BY s.weight DESC, s.id ASC`)
    .all();
  res.json({ items: rows.map(toSeries) });
});

/** 后台：新建系列 */
router.post('/admin/series', adminRequired, seriesUpload, (req, res) => {
  const files = req.files || {};
  const coverFile = files.cover && files.cover[0];
  try {
    const data = parseSeries(req.body);
    let cover = data.cover;
    if (coverFile) {
      cover = moveCover(coverFile.path, decodeOriginalName(coverFile.originalname));
    }
    const info = db
      .prepare(
        `INSERT INTO series (name, cover, description, genre, platform, weight, featured)
         VALUES (@name, @cover, @description, @genre, @platform, @weight, @featured)`,
      )
      .run({ ...data, cover });
    const row = db.prepare(`SELECT ${SERIES_SELECT} FROM series s WHERE s.id = @id`).get({
      id: info.lastInsertRowid,
    });
    res.status(201).json({ series: toSeries(row) });
  } catch (err) {
    cleanupTmp(req.files);
    res.status(400).json({ error: err.message || '保存失败' });
  }
});

/** 后台：更新系列 */
router.put('/admin/series/:id', adminRequired, seriesUpload, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
  if (!current) {
    cleanupTmp(req.files);
    return res.status(404).json({ error: '系列不存在' });
  }
  const files = req.files || {};
  const coverFile = files.cover && files.cover[0];
  const coverProvided = req.body.coverUrl !== undefined;
  try {
    const data = parseSeries(req.body, {
      name: current.name,
      cover: current.cover,
      description: current.description,
      genre: current.genre,
      platform: current.platform,
      weight: current.weight,
      featured: current.featured,
    });
    let cover = current.cover;
    if (coverFile) {
      cover = moveCover(coverFile.path, decodeOriginalName(coverFile.originalname));
      removeCoverFile(current.cover);
    } else if (coverProvided && data.cover !== current.cover) {
      removeCoverFile(current.cover);
      cover = data.cover;
    }

    db.prepare(
      `UPDATE series SET name=@name, cover=@cover, description=@description, genre=@genre,
        platform=@platform, weight=@weight, featured=@featured, updated_at=datetime('now') WHERE id=@id`,
    ).run({ ...data, cover, id });
    const row = db.prepare(`SELECT ${SERIES_SELECT} FROM series s WHERE s.id = @id`).get({ id });
    res.json({ series: toSeries(row) });
  } catch (err) {
    cleanupTmp(req.files);
    res.status(400).json({ error: err.message || '保存失败' });
  }
});

/** 后台：删除系列（其下游戏自动脱离系列，series_id 置空） */
router.delete('/admin/series/:id', adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '系列不存在' });
  db.prepare('UPDATE games SET series_id = NULL WHERE series_id = ?').run(id);
  db.prepare('DELETE FROM series WHERE id = ?').run(id);
  removeCoverFile(row.cover);
  res.json({ ok: true });
});

/**
 * 平台权重：{ weights: { nes: 100, snes: 90 } }
 * 数字越大越靠前，未提交的平台保持原值。
 */
router.put('/admin/platform-weights', adminRequired, (req, res) => {
  const input = req.body?.weights;
  if (!input || typeof input !== 'object') {
    return res.status(400).json({ error: '缺少 weights 参数' });
  }
  const upsert = db.prepare(
    `INSERT INTO platform_weights (platform_id, weight, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(platform_id) DO UPDATE SET weight = excluded.weight, updated_at = datetime('now')`,
  );
  const applied = {};
  for (const [id, value] of Object.entries(input)) {
    if (!PLATFORM_MAP.has(id)) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || Math.abs(n) > 9999) {
      return res.status(400).json({ error: `平台 ${id} 的权重需为 -9999 到 9999 的整数` });
    }
    applied[id] = n;
  }
  const tx = db.transaction(() => {
    for (const [id, n] of Object.entries(applied)) upsert.run(id, n);
  });
  tx();
  res.json({ ok: true, weights: applied });
});

/* ------------------------------ ROM 目录扫描 ------------------------------ */

/**
 * 扫描 data/roms/<平台>/ 下的文件，双向同步：
 *  1. 已登记的游戏：按「ROM 文件名」找回自己的文件（目录换了也能认），
 *     文件不在磁盘上 → 只标记 rom_missing=1，资料一条不丢；文件放回来再扫一次即恢复。
 *  2. 没登记过的文件：按默认信息直接建条目（名称 = 文件名去扩展名，平台 = 所在目录）。
 * 旧版平铺在 roms 根目录的文件也会顺手归位。
 */
router.post('/admin/roms/scan', adminRequired, (_req, res) => {
  ensureRomLayout();
  const { files: candidates, unresolved } = listRomCandidates();
  const rows = db
    .prepare(
      'SELECT id, title, platform, description, cover, cover_source, cover_auto_key, rom_file, rom_name, rom_size, rom_missing FROM games',
    )
    .all();
  // 所有 media/ 目录里的图片一次性建索引，几百个 ROM 共用，别逐个翻磁盘
  const mediaIndex = buildMediaIndex();

  const claimed = new Set();
  const created = [];
  const restored = [];
  const relinked = [];
  const missing = [];
  const skipped = [];
  const enriched = [];

  /** 同名文件优先取同平台的，其次任意平台（用户手工搬过目录的情况） */
  const pickFile = (base, platformId) => {
    const pool = candidates.filter((c) => !claimed.has(c) && c.fileName.toLowerCase() === base);
    if (!pool.length) return null;
    return pool.find((c) => c.platformId === platformId) || pool[0];
  };

  // ① 先让已登记的游戏各自认领文件（只比文件名，不比目录）
  for (const row of rows) {
    if (!row.rom_file) continue; // 从没上传过 ROM 的记录不参与，保持「待上传」
    // 先按上传时的原始文件名（rom_name）认，再按实际落盘文件名（rom_file）认
    const names = [...new Set(
      [row.rom_name, row.rom_file]
        .map((v) => path.basename(String(v || '')).toLowerCase())
        .filter(Boolean),
    )];

    const file = names.map((n) => pickFile(n, row.platform)).find(Boolean) || null;
    if (!file) {
      db.prepare('UPDATE games SET rom_missing = 1 WHERE id = ?').run(row.id);
      missing.push({
        id: row.id,
        title: row.title,
        romName: row.rom_name || path.basename(String(row.rom_file)),
      });
      continue;
    }

    claimed.add(file);
    const targetPlatform = PLATFORM_MAP.has(file.platformId) ? file.platformId : row.platform;
    let romFile = file.relPath;
    if (file.needsRelocate) {
      try {
        romFile = relocateRom(file.absPath, targetPlatform);
      } catch (err) {
        skipped.push({ file: file.fileName, reason: err.message || '文件归位失败' });
        continue;
      }
    }

    let romSize = row.rom_size || 0;
    try {
      romSize = fs.statSync(resolveRomPath(romFile) || file.absPath).size;
    } catch {
      /* 保持原大小 */
    }

    // rom_name 是上传时的原始名（街机内核靠它匹配 romset），扫描不改写，只在缺失时补上
    const nextRomName = row.rom_name || file.fileName;

    // 资料补齐：用内置资料库补中文名、简介、年份、厂商、类型、封面。
    // 只补「空着」的字段——名称仍等于文件名（说明是默认生成的）、简介为空、没有封面，
    // 管理员手动改过的内容一概不覆盖，所以反复扫描是安全的。
    const meta = lookupGameMeta(nextRomName, targetPlatform);
    const defaultTitle = titleFromFileName(nextRomName);
    const merged = mergeMeta(row, meta, defaultTitle);
    const nextTitle = merged.title;
    const nextDesc = merged.description;

    // 封面：玩家自己上传的（cover_source = 'manual'）永远不动；
    // 自动匹配的每次都跟 resources/ 对一遍，图换了就换新封面，图删了就留着旧的。
    let nextCover = row.cover;
    let nextSource = row.cover_source || '';
    let nextKey = row.cover_auto_key || '';
    if (nextSource !== 'manual') {
      const coverLost = nextCover.startsWith('/uploads/covers/') && !coverExists(nextCover);
      const src = findCoverSource(file.absPath, mediaIndex);
      if (src) {
        const fp = coverFingerprint(src);
        const unchanged = fp && fp === nextKey && nextCover && !coverLost;
        if (!unchanged) {
          const url = importCover(src, path.basename(file.absPath, path.extname(file.absPath)));
          if (nextCover && nextCover !== url) removeCoverFile(nextCover);
          nextCover = url;
          nextSource = 'auto';
          nextKey = fp;
        }
      } else if (coverLost) {
        // 封面文件被删、resources 里也没有替补：清掉指向空文件的地址
        nextCover = '';
        nextSource = '';
        nextKey = '';
      }
    }

    const metaChanged =
      nextTitle !== row.title ||
      nextDesc !== row.description ||
      nextCover !== row.cover ||
      nextSource !== (row.cover_source || '');

    const changed =
      metaChanged ||
      row.rom_missing ||
      row.rom_file !== romFile ||
      row.rom_size !== romSize ||
      row.rom_name !== nextRomName ||
      nextKey !== (row.cover_auto_key || '');
    if (!changed) {
      skipped.push({ file: file.fileName, reason: '已登记' });
      continue;
    }

    db.prepare(
      `UPDATE games SET rom_file = ?, rom_name = ?, rom_size = ?, rom_missing = 0,
        title = ?, description = ?, cover = ?, cover_source = ?, cover_auto_key = ?,
        updated_at = datetime('now') WHERE id = ?`,
    ).run(romFile, nextRomName, romSize, nextTitle, nextDesc, nextCover, nextSource, nextKey, row.id);

    if (metaChanged) {
      enriched.push({
        id: row.id,
        title: nextTitle,
        hadTitle: row.title,
        gotCover: nextCover !== row.cover && !!nextCover,
      });
    }

    if (row.rom_missing) restored.push({ id: row.id, title: nextTitle, romFile });
    else if (!metaChanged) relinked.push({ id: row.id, title: nextTitle, romFile });
  }

  // ② 剩下没被认领的文件：按默认资料新建
  for (const file of candidates) {
    if (claimed.has(file)) continue;
    const platform = PLATFORM_MAP.get(file.platformId);
    if (!platform) {
      skipped.push({ file: file.fileName, reason: '无法识别平台' });
      continue;
    }
    if (platform.bios && !hasBios(platform.bios)) {
      skipped.push({ file: file.fileName, reason: `缺少 BIOS ${platform.bios}` });
      continue;
    }

    try {
      // 封面要在搬文件之前找：media/ 就在 ROM 原来的同级目录里
      const media = findCoverSource(file.absPath, mediaIndex);
      const romFile = file.needsRelocate ? relocateRom(file.absPath, platform.id) : file.relPath;
      const romSize = fs.statSync(resolveRomPath(romFile) || file.absPath).size;

      // 用内置资料库查中文名 + 简介；查不到就按文件名来
      const meta = lookupGameMeta(file.fileName, platform.id);
      const title = meta?.title || titleFromFileName(file.fileName) || file.fileName;
      const description = meta?.description || '';
      const cover = media
        ? importCover(media, path.basename(file.fileName, path.extname(file.fileName)))
        : '';

      const info = db
        .prepare(
          `INSERT INTO games (title, platform, description, cover, cover_source, cover_auto_key,
            rom_file, rom_name, rom_size, core, bios_name, year, developer, publisher, genre, players,
            featured, rom_missing)
           VALUES (@title, @platform, @description, @cover, @coverSource, @coverKey,
            @romFile, @romName, @romSize,
            @core, @biosName, NULL, '', '', '', 1, 0, 0)`,
        )
        .run({
          title,
          platform: platform.id,
          description,
          cover,
          coverSource: media ? 'auto' : '',
          coverKey: media ? coverFingerprint(media) : '',
          romFile,
          romName: file.fileName,
          romSize,
          core: platform.core,
          biosName: platform.bios || '',
        });
      created.push({
        id: Number(info.lastInsertRowid),
        title,
        platform: platform.id,
        platformName: platform.name,
        romFile,
        cover,
        matched: !!meta,
      });
      claimed.add(file);
    } catch (err) {
      skipped.push({ file: file.fileName, reason: err.message || '导入失败' });
    }
  }

  res.json({
    scanned: candidates.length,
    created,
    restored,
    relinked,
    missing,
    skipped,
    enriched,
    mediaFiles: mediaIndex.count,
    unresolved,
    folders: PLATFORMS.map((p) => ({ platform: p.id, name: p.name, dir: `roms/${p.id}` })),
  });
});

/* ------------------------------ BIOS 管理 ------------------------------ */

router.get('/admin/bios', adminRequired, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT b.name, b.size, b.uploaded_at,
        (SELECT COUNT(*) FROM games g WHERE g.bios_name = b.name) AS used
       FROM bios_files b ORDER BY b.name`,
    )
    .all();
  res.json({
    items: rows.map((r) => ({
      name: r.name,
      size: r.size,
      uploadedAt: r.uploaded_at,
      usedBy: r.used,
    })),
    required: PLATFORMS.filter((p) => p.bios).map((p) => ({
      platform: p.id,
      platformName: p.name,
      name: p.bios,
    })),
  });
});

router.post('/admin/bios', adminRequired, biosUpload, (req, res) => {
  try {
    if (!req.file) throw new Error('请选择 BIOS 压缩包（.zip）');
    const saved = moveBios(req.file.path, decodeOriginalName(req.file.originalname));
    db.prepare(
      `INSERT INTO bios_files (name, size, uploaded_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET size = excluded.size, uploaded_at = datetime('now')`,
    ).run(saved.name, saved.size);
    res.status(201).json({ item: { name: saved.name, size: saved.size } });
  } catch (err) {
    removeFileQuietly(req.file?.path);
    res.status(400).json({ error: err.message || 'BIOS 上传失败' });
  }
});

router.delete('/admin/bios/:name', adminRequired, (req, res) => {
  const name = safeBiosName(req.params.name);
  if (!name) return res.status(400).json({ error: '无效的 BIOS 文件名' });
  const row = db.prepare('SELECT name FROM bios_files WHERE name = ?').get(name);
  if (!row) return res.status(404).json({ error: 'BIOS 不存在' });

  const used = db.prepare('SELECT COUNT(*) AS n FROM games WHERE bios_name = ?').get(name).n;
  if (used > 0) {
    return res.status(400).json({ error: `还有 ${used} 个游戏正在使用该 BIOS，请先修改这些游戏` });
  }
  db.prepare('DELETE FROM bios_files WHERE name = ?').run(name);
  removeFileQuietly(path.join(BIOS_DIR, name));
  res.json({ ok: true });
});

router.get('/admin/stats', adminRequired, (_req, res) => {
  const games = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(play_count),0) AS plays, SUM(CASE WHEN rom_file='' OR rom_missing=1 THEN 1 ELSE 0 END) AS broken FROM games")
    .get();
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const favorites = db.prepare('SELECT COUNT(*) AS n FROM favorites').get().n;
  const byPlatform = db
    .prepare('SELECT platform, COUNT(*) AS n FROM games GROUP BY platform ORDER BY n DESC')
    .all()
    .map((r) => ({
      platform: r.platform,
      name: PLATFORM_MAP.get(r.platform)?.name || r.platform,
      count: r.n,
    }));
  res.json({
    games: games.n,
    plays: games.plays,
    missingRom: games.broken || 0,
    users,
    favorites,
    byPlatform,
  });
});

router.get('/admin/users', adminRequired, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.created_at,
        (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS fav_count,
        (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id) AS play_count
       FROM users u ORDER BY u.created_at DESC`,
    )
    .all();
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      createdAt: r.created_at,
      favCount: r.fav_count,
      playCount: r.play_count,
    })),
  });
});

router.delete('/admin/users/:id', adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: '不能删除自己的账号' });
  const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  if (row.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n;
    if (admins <= 1) return res.status(400).json({ error: '至少需要保留一个管理员' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
