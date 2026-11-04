import path from 'node:path';
import express from 'express';
import { db, ASSET_DIR } from '../db.js';
import { ASSET_SLOTS, ASSET_KEYS, SLOT_MAP, ASSET_DEFAULTS } from '../assets.js';
import { adminRequired } from '../auth.js';
import { imageUpload, moveAsset, removeFileQuietly, cleanupTmp } from '../upload.js';

const router = express.Router();

function rowsByKey() {
  return new Map(db.prepare('SELECT key, url, alt, updated_at FROM site_assets').all().map((r) => [r.key, r]));
}

/**
 * 公共：前台取图。
 * 先取后台上传的覆盖值，没有则回退内置默认图（平台插画已随项目分发），
 * 两者都没有的槽位不返回，由前端走像素占位。
 */
router.get('/assets', (_req, res) => {
  const map = { ...ASSET_DEFAULTS };
  for (const [key, row] of rowsByKey()) {
    if (row.url) map[key] = row.url;
  }
  res.json({ assets: map });
});

/** 后台：列出全部槽位与当前图，并标记当前是内置默认还是自定义 */
router.get('/admin/assets', adminRequired, (_req, res) => {
  const rows = rowsByKey();
  res.json({
    items: ASSET_SLOTS.map((slot) => {
      const row = rows.get(slot.key);
      const custom = row?.url || '';
      const fallback = ASSET_DEFAULTS[slot.key] || '';
      return {
        ...slot,
        // url 给预览用：自定义优先，否则展示内置默认图
        url: custom || fallback,
        custom,
        isDefault: !custom && Boolean(fallback),
        hasDefault: Boolean(fallback),
        updatedAt: row?.updated_at || '',
      };
    }),
  });
});

/** 后台：上传图片或填写外链，替换槽位 */
router.put('/admin/assets/:key', adminRequired, imageUpload, (req, res, next) => {
  const key = String(req.params.key || '');
  if (!ASSET_KEYS.has(key)) {
    cleanupTmp({ image: req.file ? [req.file] : [] });
    return res.status(400).json({ error: '未知的素材槽位' });
  }

  try {
    const urlField = String(req.body?.url || '').trim();
    let url = '';
    let filename = '';

    if (req.file) {
      const saved = moveAsset(req.file.path, req.file.originalname);
      url = saved.url;
      filename = saved.filename;
    } else if (urlField) {
      if (!/^(https?:\/\/|\/)/i.test(urlField)) throw new Error('外链需以 http(s):// 或 / 开头');
      url = urlField;
    } else {
      throw new Error('请选择图片文件或填写图片地址');
    }

    const old = db.prepare('SELECT url, filename FROM site_assets WHERE key = ?').get(key);
    db.prepare(
      `INSERT INTO site_assets (key, url, filename, alt, updated_at)
       VALUES (@key, @url, @filename, @alt, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         url = excluded.url, filename = excluded.filename,
         alt = excluded.alt, updated_at = datetime('now')`,
    ).run({ key, url, filename, alt: String(req.body?.alt || '').slice(0, 200) });

    // 旧图是本地上传的就删掉，避免 data/assets 越堆越多
    if (old?.filename && old.filename !== filename) {
      removeFileQuietly(path.join(ASSET_DIR, old.filename));
    }

    res.json({ ok: true, slot: { ...SLOT_MAP.get(key), url } });
  } catch (err) {
    if (req.file) removeFileQuietly(req.file.path);
    next(err);
  }
});

/** 后台：清空槽位，恢复前端默认样式 */
router.delete('/admin/assets/:key', adminRequired, (req, res) => {
  const key = String(req.params.key || '');
  if (!ASSET_KEYS.has(key)) return res.status(400).json({ error: '未知的素材槽位' });
  const old = db.prepare('SELECT filename FROM site_assets WHERE key = ?').get(key);
  db.prepare('DELETE FROM site_assets WHERE key = ?').run(key);
  if (old?.filename) removeFileQuietly(path.join(ASSET_DIR, old.filename));
  res.json({ ok: true });
});

export default router;
