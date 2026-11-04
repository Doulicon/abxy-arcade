import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { DATA_DIR, ROM_DIR, COVER_DIR, BIOS_DIR, ASSET_DIR, ADMIN_USERNAME, ADMIN_PASSWORD } from './config.js';
import { LEGACY_PLATFORM_IDS } from './platforms.js';

export { ROM_DIR, COVER_DIR, BIOS_DIR, ASSET_DIR };
fs.mkdirSync(ROM_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });
fs.mkdirSync(BIOS_DIR, { recursive: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  platform    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover       TEXT NOT NULL DEFAULT '',
  rom_file    TEXT NOT NULL DEFAULT '',
  rom_name    TEXT NOT NULL DEFAULT '',
  rom_size    INTEGER NOT NULL DEFAULT 0,
  core        TEXT NOT NULL DEFAULT '',
  bios_name   TEXT NOT NULL DEFAULT '',
  year        INTEGER,
  developer   TEXT NOT NULL DEFAULT '',
  publisher   TEXT NOT NULL DEFAULT '',
  genre       TEXT NOT NULL DEFAULT '',
  players     INTEGER NOT NULL DEFAULT 1,
  play_count  INTEGER NOT NULL DEFAULT 0,
  featured    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

/** 平台权重：数字越大越靠前；没有记录的平台按内置顺序、权重 0 处理 */
CREATE TABLE IF NOT EXISTS platform_weights (
  platform_id TEXT PRIMARY KEY,
  weight      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bios_files (
  name        TEXT PRIMARY KEY,
  size        INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/** 站点静态图片素材：按固定 key 槽位存储，前台按 key 取图 */
CREATE TABLE IF NOT EXISTS site_assets (
  key        TEXT PRIMARY KEY,
  url        TEXT NOT NULL DEFAULT '',
  filename   TEXT NOT NULL DEFAULT '',
  alt        TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/** 站点展示文案：按 语言 + key 存覆盖值，未覆盖时用 server/texts.js 的内置默认 */
CREATE TABLE IF NOT EXISTS site_texts (
  locale     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (locale, key)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS plays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);
CREATE INDEX IF NOT EXISTS idx_games_created  ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_play     ON games(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_fav_user       ON favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plays_user     ON plays(user_id, created_at DESC);
`);

/** 轻量迁移：老库补列，避免升级时手删数据库 */
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

ensureColumn('games', 'core', "core TEXT NOT NULL DEFAULT ''");
ensureColumn('games', 'bios_name', "bios_name TEXT NOT NULL DEFAULT ''");
/** ROM 文件暂时不在磁盘上：保留条目与全部资料，只标记为「缺 ROM」，下次扫描按文件名自动恢复 */
ensureColumn('games', 'rom_missing', 'rom_missing INTEGER NOT NULL DEFAULT 0');
/** 手动权重：数字越大越靠前（0 = 未设置），用于首页分区与游戏库排序 */
ensureColumn('games', 'weight', 'weight INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE INDEX IF NOT EXISTS idx_games_weight ON games(weight DESC)');

/** 所属系列：NULL = 不属于任何系列（默认）；有系列的游戏在前台列表里不单独展示 */
ensureColumn('games', 'series_id', 'series_id INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS idx_games_series ON games(series_id)');

/** 游戏系列：管理员维护，含封面 / 名称 / 简介 / 类型 / 平台 / 权重 */
db.exec(`
CREATE TABLE IF NOT EXISTS series (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  cover       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  genre       TEXT NOT NULL DEFAULT '',
  platform    TEXT NOT NULL DEFAULT '',
  weight      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_series_weight ON series(weight DESC);
`);

/** 系列所属平台：空 = 不限平台；指定后该系列内的游戏必须同属此平台（迁移老库补列） */
ensureColumn('series', 'platform', "platform TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_series_platform ON series(platform)');

/** 系列是否设为首页精选（1 = 精选） */
ensureColumn('series', 'featured', 'featured INTEGER NOT NULL DEFAULT 0');

/**
 * 品牌改名一次性迁移：老库里被后台改过的品牌/标题文案仍是旧名字，
 * 这里统一替换成 ABXY ARCADE（幂等，替换后不会再命中）。
 */
db.prepare(
  `UPDATE site_texts
      SET value = REPLACE(REPLACE(value, 'ENLU ARCADE', 'ABXY ARCADE'), 'ZXCV ARCADE', 'ABXY ARCADE')
    WHERE value LIKE '%ENLU ARCADE%' OR value LIKE '%ZXCV ARCADE%'`,
).run();

/**
 * 平台 id 改名迁移：nes → fc、snes → sfc。
 *
 * 早期版本平台 id 直接沿用 EmulatorJS 的系统名（nes/snes），后来统一成显示简称（fc/sfc）。
 * 老库里 games.platform 等字段仍挂着旧 id，不迁移的话新代码会把它们当成「未知平台」，
 * 表现为首页/游戏库里 FC 分区一条游戏都没有。这里一次性改写所有相关表（幂等）。
 */
export function migrateLegacyPlatformIds() {
  const pairs = Object.entries(LEGACY_PLATFORM_IDS);
  let changed = 0;

  const run = db.transaction(() => {
    for (const [oldId, newId] of pairs) {
      // 游戏所属平台
      changed += db.prepare('UPDATE games SET platform = ? WHERE platform = ?').run(newId, oldId).changes;

      // 系列指定平台（空串表示不限）
      changed += db.prepare('UPDATE series SET platform = ? WHERE platform = ?').run(newId, oldId).changes;

      // 平台权重：platform_id 是主键，新旧同时存在时保留新 id 的记录，丢弃旧记录
      const wNew = db.prepare('SELECT 1 FROM platform_weights WHERE platform_id = ?').get(newId);
      if (wNew) {
        db.prepare('DELETE FROM platform_weights WHERE platform_id = ?').run(oldId);
      } else {
        changed += db.prepare('UPDATE platform_weights SET platform_id = ? WHERE platform_id = ?').run(newId, oldId).changes;
      }

      // 站点素材槽位（platform_<id>）：同上，key 是主键
      for (const prefix of ['platform_']) {
        const oldKey = `${prefix}${oldId}`;
        const newKey = `${prefix}${newId}`;
        if (!db.prepare('SELECT 1 FROM site_assets WHERE key = ?').get(oldKey)) continue;
        if (db.prepare('SELECT 1 FROM site_assets WHERE key = ?').get(newKey)) {
          db.prepare('DELETE FROM site_assets WHERE key = ?').run(oldKey);
        } else {
          changed += db.prepare('UPDATE site_assets SET key = ? WHERE key = ?').run(newKey, oldKey).changes;
        }
      }

      // 站点文案 key：platform.<id>.<field>，主键是 (locale, key)
      const textRows = db
        .prepare("SELECT locale, key FROM site_texts WHERE key LIKE ?")
        .all(`platform.${oldId}.%`);
      for (const row of textRows) {
        const newKey = row.key.replace(`platform.${oldId}.`, `platform.${newId}.`);
        const clash = db
          .prepare('SELECT 1 FROM site_texts WHERE locale = ? AND key = ?')
          .get(row.locale, newKey);
        if (clash) {
          db.prepare('DELETE FROM site_texts WHERE locale = ? AND key = ?').run(row.locale, row.key);
        } else {
          changed += db
            .prepare('UPDATE site_texts SET key = ? WHERE locale = ? AND key = ?')
            .run(newKey, row.locale, row.key).changes;
        }
      }
    }
  });

  run();
  return changed;
}

/** 首次启动创建管理员账号 */
export function ensureAdmin() {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (exists) return false;
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
    ADMIN_USERNAME,
    hash,
    'admin',
  );
  return true;
}
