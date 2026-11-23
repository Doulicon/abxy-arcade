import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, uploadWithProgress } from '../api';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { EmptyState, Modal, Spinner } from '../components/ui';
import type { Platform, Series } from '../types';

const GENRE_SUGGESTIONS = ['动作', '冒险', '角色扮演', '射击', '格斗', '赛车', '体育', '益智', '策略', '音乐'];

const EMPTY = {
  name: '',
  genre: '',
  platform: '',
  weight: '0',
  featured: false,
  description: '',
  coverUrl: '',
};

type FormState = typeof EMPTY;

/** 系列管理：列表 + 新增/编辑/删除 */
export default function AdminSeries() {
  const { t, tx } = useI18n();
  const toast = useToast();

  const [items, setItems] = useState<Series[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Series | null>(null);

  const [deleting, setDeleting] = useState<Series | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: Series[] }>('/admin/series');
      setItems(res.items);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.seriesFail'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
    api
      .get<{ items: Platform[] }>('/platforms')
      .then((r) => setPlatforms(r.items))
      .catch(() => setPlatforms([]));
  }, [load]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/admin/series/${deleting.id}`);
      toast(t('admin.series.deleted'), 'success');
      setDeleting(null);
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.seriesFail'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="border-l-2 border-neon/40 bg-neon/[0.04] px-3 py-2 text-[11px] leading-relaxed text-muted">
          {t('admin.series.hint')}
        </p>
        <button
          className="btn btn-primary shrink-0 text-[11px]"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <IconPlus className="h-3.5 w-3.5" /> {t('admin.series.add')}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t('admin.series.none')} description={t('admin.series.noneDesc')} />
      ) : (
        <div className="border-2 border-line bg-panel">
          <div className="grid grid-cols-[56px_1fr_90px_70px_90px] gap-3 border-b-2 border-line bg-[#101018] px-3 py-2 text-[11px] font-black tracking-wide text-muted">
            <span>{t('admin.series.th.cover')}</span>
            <span>{t('admin.series.th.name')}</span>
            <span>{t('admin.series.th.genre')}</span>
            <span className="text-right">{t('admin.series.th.games')}</span>
            <span className="text-right">{t('admin.series.th.weight')}</span>
          </div>
          {items.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[56px_1fr_90px_70px_90px] items-center gap-3 border-b border-line/60 px-3 py-2 last:border-0 hover:bg-white/[0.03]"
            >
              <div className="flex h-10 w-14 items-center justify-center overflow-hidden border border-line bg-[#0f0f16]">
                {s.cover ? (
                  <img src={s.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[9px] text-muted">—</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-white">
                  {s.name}
                  {s.featured && (
                    <span className="ml-1.5 text-[#ffd166]">{t('admin.series.featuredBadge')}</span>
                  )}
                </p>
                {s.description && (
                  <p className="truncate text-[10px] text-muted">{s.description}</p>
                )}
              </div>
              <span className="truncate text-[11px] text-white/60">
                {s.platform
                  ? (tx(`platform.${s.platform}.short`) ||
                      tx(`platform.${s.platform}.name`) ||
                      s.platform) + (s.genre ? ' · ' + s.genre : '')
                  : s.genre || '—'}
              </span>
              <span className="text-right text-[11px] text-white/60">{s.gameCount}</span>
              <div className="flex items-center justify-end gap-1">
                <span className="mr-1 text-[11px] font-bold text-white/70">{s.weight}</span>
                <button
                  className="flex h-7 w-7 items-center justify-center border border-line text-muted transition-colors hover:border-neon hover:text-neon"
                  aria-label={t('action.edit')}
                  onClick={() => {
                    setEditing(s);
                    setFormOpen(true);
                  }}
                >
                  <IconEdit className="h-3.5 w-3.5" />
                </button>
                <button
                  className="flex h-7 w-7 items-center justify-center border border-line text-muted transition-colors hover:border-[#ff5b7f] hover:text-[#ff5b7f]"
                  aria-label={t('action.delete')}
                  onClick={() => setDeleting(s)}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SeriesForm
        open={formOpen}
        initial={editing}
        platforms={platforms}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <Modal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        title={t('admin.series.confirmTitle')}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDeleting(null)} disabled={busy}>
              {t('action.cancel')}
            </button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null}
              {t('action.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-white/75">
          {t('admin.series.confirmMsg', { name: deleting?.name || '' })}
        </p>
      </Modal>
    </div>
  );
}

function SeriesForm({
  open,
  initial,
  platforms,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Series | null;
  platforms: Platform[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tx } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isEdit = !!initial;

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setCoverFile(null);
    if (initial) {
      setForm({
        name: initial.name,
        genre: initial.genre,
        platform: initial.platform || '',
        weight: String(initial.weight ?? 0),
        featured: !!initial.featured,
        description: initial.description,
        coverUrl: initial.cover,
      });
      setPreview(initial.cover);
    } else {
      setForm({ ...EMPTY });
      setPreview('');
    }
  }, [open, initial]);

  useEffect(() => {
    if (!coverFile) return;
    const url = URL.createObjectURL(coverFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setError('');
    if (!form.name.trim()) {
      setError(t('admin.series.err.name'));
      return;
    }
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('genre', form.genre.trim());
    fd.append('platform', form.platform.trim());
    fd.append('weight', form.weight.trim() || '0');
    fd.append('featured', form.featured ? '1' : '0');
    fd.append('description', form.description.trim());
    fd.append('coverUrl', form.coverUrl.trim());
    if (coverFile) fd.append('cover', coverFile);

    setBusy(true);
    try {
      if (isEdit && initial) {
        await api.put(`/admin/series/${initial.id}`, fd);
        toast(t('admin.series.saved'), 'success');
      } else {
        await uploadWithProgress('/admin/series', fd, () => undefined);
        toast(t('admin.series.created'), 'success');
      }
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('form.err.save'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={isEdit ? t('admin.series.edit') : t('admin.series.add')}
      width="max-w-2xl"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {isEdit ? t('form.save') : t('form.publish')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        {/* 封面 */}
        <div>
          <span className="label">{t('admin.series.cover')}</span>
          <label className="relative block aspect-[3/4] w-full cursor-pointer overflow-hidden border-2 border-line bg-[#0f0f16] transition-colors hover:border-neon">
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted">
                {t('admin.series.coverHint')}
              </div>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            />
          </label>
          <input
            className="field mt-2 text-[11px]"
            placeholder={t('admin.series.coverUrl')}
            value={form.coverUrl}
            onChange={(e) => {
              set('coverUrl', e.target.value);
              if (!coverFile) setPreview(e.target.value);
            }}
          />
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="label">{t('admin.series.name')}</label>
            <input
              className="field"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={t('admin.series.namePh')}
              maxLength={90}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('admin.series.genre')}</label>
              <input
                className="field"
                list="series-genre-list"
                value={form.genre}
                onChange={(e) => set('genre', e.target.value)}
                placeholder={t('admin.series.genrePh')}
                maxLength={30}
              />
              <datalist id="series-genre-list">
                {GENRE_SUGGESTIONS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">{t('admin.series.weight')}</label>
              <input
                className="field"
                type="number"
                value={form.weight}
                onChange={(e) => set('weight', e.target.value)}
                placeholder="0"
                min={-9999}
                max={9999}
              />
            </div>
          </div>
          <div>
            <label className="label">{t('admin.series.platform')}</label>
            <select
              className="field"
              value={form.platform}
              onChange={(e) => set('platform', e.target.value)}
            >
              <option value="">{t('admin.series.platformAny')}</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {tx(`platform.${p.id}.name`) || p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[9px] leading-relaxed text-white/30">
              {t('admin.series.platformHint')}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set('featured', e.target.checked)}
              className="h-3.5 w-3.5 accent-[#4cc9ff]"
            />
            <span className="text-xs font-bold text-white/80">{t('admin.series.featured')}</span>
          </label>
          <div>
            <label className="label">{t('admin.series.desc')}</label>
            <textarea
              className="field min-h-[88px] resize-y"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t('admin.series.descPh')}
              maxLength={2000}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 border-2 border-[#7f2038] bg-[#3a1020]/70 px-3 py-2 text-xs leading-relaxed text-[#ff8fa8]">
          {error}
        </div>
      )}
    </Modal>
  );
}
