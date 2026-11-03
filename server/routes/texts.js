import express from 'express';
import { db } from '../db.js';
import { adminRequired } from '../auth.js';
import {
  LOCALES,
  LOCALE_IDS,
  DEFAULT_LOCALE,
  TEXT_KEY_SET,
  TEXT_FIELDS,
  textGroups,
  isLocale,
  mergeTexts,
  defaultsFor,
} from '../texts.js';

const router = express.Router();

function rowsFor(locale) {
  return new Map(
    db
      .prepare('SELECT key, value FROM site_texts WHERE locale = ?')
      .all(locale)
      .map((r) => [r.key, r.value]),
  );
}

/** 前台：取某个语言的完整文案（已合并默认与中文回退） */
router.get('/texts', (req, res) => {
  const locale = isLocale(String(req.query.locale || '')) ? String(req.query.locale) : DEFAULT_LOCALE;
  const own = rowsFor(locale);
  const zh = locale === DEFAULT_LOCALE ? own : rowsFor(DEFAULT_LOCALE);

  res.setHeader('Cache-Control', 'public, max-age=15');
  res.json({
    locale,
    defaultLocale: DEFAULT_LOCALE,
    locales: LOCALES,
    texts: mergeTexts(locale, own, zh),
  });
});

/** 后台：读取全部语言的可编辑文案 */
router.get('/admin/texts', adminRequired, (_req, res) => {
  const values = {};
  const overridden = {};
  for (const locale of LOCALE_IDS) {
    const rows = rowsFor(locale);
    values[locale] = mergeTexts(locale, rows, locale === DEFAULT_LOCALE ? rows : rowsFor(DEFAULT_LOCALE));
    overridden[locale] = [...rows.keys()].filter((k) => TEXT_KEY_SET.has(k));
  }
  res.json({
    locales: LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    groups: textGroups(),
    values,
    overridden,
    defaults: Object.fromEntries(LOCALE_IDS.map((l) => [l, defaultsFor(l)])),
  });
});

/** 后台：批量保存某个语言的文案；空字符串表示删除覆盖、恢复默认 */
router.put('/admin/texts', adminRequired, (req, res) => {
  const locale = String(req.body?.locale || '');
  if (!isLocale(locale)) return res.status(400).json({ error: '不支持的语言' });

  const input = req.body?.values;
  if (!input || typeof input !== 'object') return res.status(400).json({ error: '缺少文案内容' });

  const upsert = db.prepare(
    `INSERT INTO site_texts (locale, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(locale, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  );
  const remove = db.prepare('DELETE FROM site_texts WHERE locale = ? AND key = ?');

  const saved = [];
  const cleared = [];
  try {
    db.transaction(() => {
      for (const [key, raw] of Object.entries(input)) {
        if (!TEXT_KEY_SET.has(key)) continue;
        const field = TEXT_FIELDS.find((f) => f.key === key);
        const value = String(raw ?? '')
          .replace(/\r\n/g, '\n')
          .slice(0, field?.max || 400);
        if (value.trim()) {
          upsert.run(locale, key, value);
          saved.push(key);
        } else {
          remove.run(locale, key);
          cleared.push(key);
        }
      }
    })();
    res.json({ ok: true, saved: saved.length, cleared: cleared.length });
  } catch (err) {
    res.status(400).json({ error: err.message || '保存失败' });
  }
});

/** 后台：把某个语言（或单个 key）恢复为内置默认 */
router.post('/admin/texts/reset', adminRequired, (req, res) => {
  const locale = String(req.body?.locale || '');
  if (!isLocale(locale)) return res.status(400).json({ error: '不支持的语言' });
  const key = String(req.body?.key || '');

  if (key) {
    if (!TEXT_KEY_SET.has(key)) return res.status(400).json({ error: '未知的文案 key' });
    db.prepare('DELETE FROM site_texts WHERE locale = ? AND key = ?').run(locale, key);
  } else {
    db.prepare('DELETE FROM site_texts WHERE locale = ?').run(locale);
  }
  res.json({ ok: true });
});

export default router;
