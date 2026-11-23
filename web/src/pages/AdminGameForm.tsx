import { useEffect, useMemo, useRef, useState } from 'react';
import { api, putFormWithProgress, uploadWithProgress, ApiError } from '../api';
import { IconUpload, IconX } from '../components/Icons';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { Modal, PlatformBadge, Spinner } from '../components/ui';
import type { Game, Platform, Series } from '../types';
import { formatBytes } from '../utils';

type Props = {
  open: boolean;
  initial: Game | null;
  platforms: Platform[];
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY = {
  title: '',
  // 新建时默认「自动识别」：后端按 ROM 后缀判断平台
  platform: '',
  year: '',
  developer: '',
  publisher: '',
  genre: '',
  players: '1',
  weight: '0',
  seriesId: '',
  description: '',
  coverUrl: '',
  featured: false,
  core: '',
  biosName: '',
};

type BiosItem = { name: string; size: number; usedBy: number };

const CORE_KEYS: Record<string, string> = {
  fbneo: 'form.core.fbneo',
  fbalpha2012_cps1: 'form.core.cps1',
  fbalpha2012_cps2: 'form.core.cps2',
};

const GENRE_SUGGESTIONS = ['动作', '冒险', '角色扮演', '射击', '格斗', '赛车', '体育', '益智', '策略', '音乐'];

export default function AdminGameForm({ open, initial, platforms, onClose, onSaved }: Props) {
  const toast = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState({ ...EMPTY });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [romFile, setRomFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [biosList, setBiosList] = useState<BiosItem[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const coverInput = useRef<HTMLInputElement>(null);
  const romInput = useRef<HTMLInputElement>(null);

  const coreLabel = (c: string) => {
    const key = CORE_KEYS[c];
    if (!key) return c;
    const label = t(key);
    return label === key ? c : label;
  };

  const isEdit = !!initial;
  const platform = useMemo(
    () => platforms.find((p) => p.id === form.platform),
    [platforms, form.platform],
  );

  useEffect(() => {
    if (!open) return;
    setError('');
    setProgress(0);
    setBusy(false);
    setCoverFile(null);
    setRomFile(null);
    if (initial) {
      setForm({
        title: initial.title,
        platform: initial.platform,
        year: initial.year ? String(initial.year) : '',
        developer: initial.developer,
        publisher: initial.publisher,
        genre: initial.genre,
        players: String(initial.players),
        weight: String(initial.weight ?? 0),
        seriesId: initial.seriesId ? String(initial.seriesId) : '',
        description: initial.description,
        coverUrl: initial.cover,
        featured: initial.featured,
        core: initial.core || '',
        biosName: initial.biosName || '',
      });
      setPreview(initial.cover);
    } else {
      setForm({ ...EMPTY, platform: '' });
      setPreview('');
    }
    if (coverInput.current) coverInput.current.value = '';
    if (romInput.current) romInput.current.value = '';
    api
      .get<{ items: BiosItem[] }>('/admin/bios')
      .then((r) => setBiosList(r.items))
      .catch(() => setBiosList([]));
    api
      .get<{ items: Series[] }>('/admin/series')
      .then((r) => setSeriesList(r.items))
      .catch(() => setSeriesList([]));
  }, [open, initial, platforms]);

  useEffect(() => {
    if (!coverFile) return;
    const url = URL.createObjectURL(coverFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const changePlatform = (id: string) => {
    const next = platforms.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      platform: id,
      core: next?.core || '',
      biosName: next?.bios && biosList.some((b) => b.name === next.bios) ? next.bios : '',
    }));
  };

  const submit = async () => {
    setError('');
    // 名称可留空：上传了 ROM 时后端会用文件名当默认名称
    if (!form.title.trim() && (!romFile || isEdit)) {
      setError(t('form.err.title'));
      return;
    }
    if (!isEdit && !romFile) {
      setError(t('form.err.rom'));
      return;
    }
    if (romFile && platform) {
      const ext = `.${romFile.name.split('.').pop()?.toLowerCase()}`;
      if (!platform.exts.includes(ext)) {
        setError(
          t('form.err.ext', {
            platform: platform.name,
            ext,
            list: platform.exts.join(' '),
          }),
        );
        return;
      }
    }

    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('platform', form.platform);
    fd.append('year', form.year.trim());
    fd.append('developer', form.developer.trim());
    fd.append('publisher', form.publisher.trim());
    fd.append('genre', form.genre.trim());
    fd.append('players', form.players);
    fd.append('weight', form.weight.trim() || '0');
    fd.append('seriesId', form.seriesId.trim());
    fd.append('description', form.description.trim());
    fd.append('coverUrl', form.coverUrl.trim());
    fd.append('featured', form.featured ? '1' : '0');
    fd.append('core', form.core || platform?.core || '');
    fd.append('biosName', form.biosName);
    if (coverFile) fd.append('cover', coverFile);
    if (romFile) fd.append('rom', romFile);

    setBusy(true);
    setProgress(0);
    try {
      if (isEdit && initial) {
        await putFormWithProgress(`/admin/games/${initial.id}`, fd, setProgress);
        toast(t('form.toast.saved'), 'success');
      } else {
        await uploadWithProgress('/admin/games', fd, setProgress);
        toast(t('form.toast.published'), 'success');
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
      title={isEdit ? t('form.edit', { title: initial?.title || '' }) : t('form.new')}
      width="max-w-3xl"
      footer={
        <>
          {busy && progress > 0 && (
            <div className="mr-auto flex items-center gap-2 text-[11px] text-muted">
              <div className="h-1.5 w-28 bg-white/10">
                <div className="h-full bg-neon transition-all" style={{ width: `${progress}%` }} />
              </div>
              {progress}%
            </div>
          )}
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
      <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
        {/* 封面 */}
        <div>
          <span className="label">{t('form.cover')}</span>
          <div
            className="relative aspect-[3/4] w-full cursor-pointer overflow-hidden border-2 border-line bg-[#0f0f16] transition-colors hover:border-neon"
            onClick={() => coverInput.current?.click()}
          >
            {preview ? (
              <img src={preview} alt={t('form.cover')} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
                <IconUpload className="h-6 w-6" />
                <span className="text-[11px]">{t('form.coverUpload')}</span>
                <span className="text-[10px] text-white/25">{t('form.coverHint')}</span>
              </div>
            )}
            {preview && (
              <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-center text-[10px] font-bold text-white/70">
                {t('form.coverChange')}
              </span>
            )}
          </div>
          <input
            ref={coverInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
          />
          <input
            className="field mt-2 text-[11px]"
            placeholder={t('form.coverUrl')}
            value={form.coverUrl}
            onChange={(e) => {
              set('coverUrl', e.target.value);
              if (!coverFile) setPreview(e.target.value);
            }}
          />
          {coverFile && (
            <button
              className="mt-1.5 flex items-center gap-1 text-[10px] text-muted hover:text-[#ff8fa8]"
              onClick={() => {
                setCoverFile(null);
                setPreview(form.coverUrl);
                if (coverInput.current) coverInput.current.value = '';
              }}
            >
              <IconX className="h-3 w-3" /> {t('form.coverRemove')}
            </button>
          )}
          {!coverFile && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
              {initial?.cover && initial.coverSource === 'auto'
                ? t('form.coverAutoHint')
                : t('form.coverPriorityHint')}
            </p>
          )}
        </div>

        {/* 表单字段 */}
        <div className="space-y-3.5">
          <div>
            <label className="label">{isEdit ? t('form.title') : t('form.titleOpt')}</label>
            <input
              className="field"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={t('form.titlePh')}
              maxLength={90}
            />
            {!isEdit && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
                {t('form.titleAutoHint')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('form.platform')}</label>
              <select
                className="field"
                value={form.platform}
                onChange={(e) => changePlatform(e.target.value)}
              >
                {!isEdit && <option value="">{t('form.platformAuto')}</option>}
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('form.year')}</label>
              <input
                className="field"
                type="number"
                value={form.year}
                onChange={(e) => set('year', e.target.value)}
                placeholder="1985"
                min={1958}
                max={2100}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('form.core')}</label>
              <select
                className="field"
                value={form.core || platform?.core || ''}
                onChange={(e) => set('core', e.target.value)}
              >
                {!platform && <option value="">{t('form.coreAuto')}</option>}
                {(platform?.cores && platform.cores.length ? platform.cores : [platform?.core || '']).map(
                  (c) => (
                    <option key={c} value={c}>
                      {coreLabel(c)}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="label">
                {t('form.bios')} {platform?.bios && <span className="text-[#ffb020]">*</span>}
              </label>
              <select
                className="field"
                value={form.biosName}
                onChange={(e) => set('biosName', e.target.value)}
              >
                <option value="">{t('form.biosNone')}</option>
                {biosList.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {platform?.hint && (
            <p className="border-l-2 border-[#ffb020] bg-[#ffb020]/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-[#ffb020]">
              {platform.hint}
            </p>
          )}
          {platform?.bios && !biosList.some((b) => b.name === platform.bios) && (
            <p className="border-l-2 border-[#ff7a45] bg-[#ff7a45]/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-[#ff9a6b]">
              {t('form.biosMissing', { name: platform.bios })}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('form.developer')}</label>
              <input
                className="field"
                value={form.developer}
                onChange={(e) => set('developer', e.target.value)}
                placeholder="Nintendo"
                maxLength={60}
              />
            </div>
            <div>
              <label className="label">{t('form.publisher')}</label>
              <input
                className="field"
                value={form.publisher}
                onChange={(e) => set('publisher', e.target.value)}
                placeholder="Nintendo"
                maxLength={60}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">{t('form.genre')}</label>
              <input
                className="field"
                list="genre-list"
                value={form.genre}
                onChange={(e) => set('genre', e.target.value)}
                placeholder={t('form.genrePh')}
                maxLength={30}
              />
              <datalist id="genre-list">
                {GENRE_SUGGESTIONS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <p className="mt-1 text-[9px] leading-relaxed text-white/30">{t('form.genreHint')}</p>
            </div>
            <div>
              <label className="label">{t('form.players')}</label>
              <select
                className="field"
                value={form.players}
                onChange={(e) => set('players', e.target.value)}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {t('form.playersUnit', { n })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('form.weight')}</label>
              <input
                className="field"
                type="number"
                value={form.weight}
                onChange={(e) => set('weight', e.target.value)}
                placeholder="0"
                min={-9999}
                max={9999}
              />
              <p className="mt-1 text-[9px] leading-relaxed text-white/30">{t('form.weightHint')}</p>
            </div>
          </div>

          <div>
            <label className="label">{t('form.series')}</label>
            <select
              className="field"
              value={form.seriesId}
              onChange={(e) => set('seriesId', e.target.value)}
            >
              <option value="">{t('form.seriesNone')}</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[9px] leading-relaxed text-white/30">{t('form.seriesHint')}</p>
          </div>

          <div>
            <label className="label">{t('form.desc')}</label>
            <textarea
              className="field min-h-[88px] resize-y"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t('form.descPh')}
              maxLength={5000}
            />
          </div>

          <div>
            <label className="label">
              {t('form.rom')} {!isEdit && '*'}
            </label>
            <div
              className="flex cursor-pointer items-center justify-between gap-3 border-2 border-dashed border-line bg-[#0f0f16] px-3 py-3 transition-colors hover:border-neon/60"
              onClick={() => romInput.current?.click()}
            >
              <div className="min-w-0">
                {romFile ? (
                  <>
                    <p className="truncate text-xs font-bold text-white">{romFile.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{formatBytes(romFile.size)}</p>
                  </>
                ) : isEdit && initial?.hasRom ? (
                  <>
                    <p className="truncate text-xs font-bold text-white/70">{initial.romName}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {t('form.romExisting', { size: formatBytes(initial.romSize) })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-white/60">{t('form.romPick')}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {t('form.romSupport', { exts: platform?.exts.join(' / ') || '' })}
                    </p>
                  </>
                )}
              </div>
              <IconUpload className="h-4 w-4 shrink-0 text-muted" />
            </div>
            <input
              ref={romInput}
              type="file"
              className="hidden"
              onChange={(e) => setRomFile(e.target.files?.[0] || null)}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 border-2 border-line bg-[#0f0f16] px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set('featured', e.target.checked)}
              className="h-4 w-4 accent-[#4cc9ff]"
            />
            <span className="text-xs font-bold text-white/80">{t('form.featured')}</span>
            <span className="ml-auto">
              {platform && <PlatformBadge name={platform.short} color={platform.color} />}
            </span>
          </label>

          {error && (
            <div className="border-2 border-[#7f2038] bg-[#3a1020]/70 px-3 py-2 text-xs leading-relaxed text-[#ff8fa8]">
              {error}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
