import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAssetCtx } from '../assets';
import { IconImage, IconTrash, IconUpload, IconX } from '../components/Icons';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import type { AssetSlot } from '../types';

const GROUPS = ['首页', '平台分区', '通用'];

/** 平台槽位 label/hint 由服务端生成，标题改用站点文案里的平台名 */
const platformIdOf = (key: string) =>
  key.startsWith('platform_') ? key.slice('platform_'.length) : '';

export default function AdminAssets() {
  const toast = useToast();
  const { t, tx } = useI18n();
  const { reload } = useAssetCtx();
  const [slots, setSlots] = useState<AssetSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [editing, setEditing] = useState<AssetSlot | null>(null);
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKey = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: AssetSlot[] }>('/admin/assets');
      setSlots(res.items);
    } catch (e: any) {
      toast(e?.message || t('assets.toast.loadFail'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const slotLabel = (slot: AssetSlot) => {
    const pid = platformIdOf(slot.key);
    if (pid) return `${tx(`platform.${pid}.name`) || pid} · ${t('assets.slot.platform')}`;
    const key = `assets.slot.${slot.key}`;
    const label = t(key);
    return label === key ? slot.label : label;
  };

  const groupLabel = (g: string) =>
    g === '首页'
      ? t('assets.group.home')
      : g === '平台分区'
        ? t('assets.group.platform')
        : g === '通用'
          ? t('assets.group.common')
          : g;

  const grouped = useMemo(
    () =>
      GROUPS.map((g) => ({ group: g, items: slots.filter((s) => s.group === g) })).filter(
        (g) => g.items.length,
      ),
    [slots],
  );

  const upload = async (slot: AssetSlot, file: File) => {
    setBusyKey(slot.key);
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api.put<{ slot: AssetSlot }>(`/admin/assets/${slot.key}`, fd);
      setSlots((prev) => prev.map((s) => (s.key === slot.key ? { ...s, url: res.slot.url } : s)));
      await reload();
      toast(t('assets.toast.updated', { label: slotLabel(slot) }), 'success');
    } catch (e: any) {
      toast(e?.message || t('assets.toast.uploadFail'), 'error');
    } finally {
      setBusyKey('');
    }
  };

  const saveUrl = async () => {
    if (!editing) return;
    const value = urlValue.trim();
    setBusyKey(editing.key);
    try {
      const res = await api.put<{ slot: AssetSlot }>(`/admin/assets/${editing.key}`, { url: value });
      setSlots((prev) => prev.map((s) => (s.key === editing.key ? { ...s, url: res.slot.url } : s)));
      await reload();
      toast(t('assets.toast.saved'), 'success');
      setEditing(null);
    } catch (e: any) {
      toast(e?.message || t('assets.toast.saveFail'), 'error');
    } finally {
      setBusyKey('');
    }
  };

  const clear = async (slot: AssetSlot) => {
    setBusyKey(slot.key);
    try {
      await api.del(`/admin/assets/${slot.key}`);
      // 不手动置空：reload 会拿回后端回退后的默认图，避免预览闪一下空白
      await reload();
      toast(t('assets.toast.restored', { label: slotLabel(slot) }), 'info');
    } catch (e: any) {
      toast(e?.message || t('assets.toast.clearFail'), 'error');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-8">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const key = pendingKey.current;
          const slot = slots.find((s) => s.key === key);
          if (file && slot) upload(slot, file);
          e.target.value = '';
        }}
      />

      <div className="border-2 border-line bg-panel/60 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted">
          {t('assets.intro')}
        </p>
      </div>

      {grouped.map(({ group, items }) => (
        <section key={group}>
          <div className="section-head">
            <h2 className="section-title">{groupLabel(group)}</h2>
            <span className="text-[11px] font-bold text-muted">{t('assets.slots', { n: items.length })}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((slot) => (
              <div key={slot.key} className="flex flex-col border-2 border-line bg-panel">
                <div
                  className={`relative overflow-hidden border-b-2 border-line bg-[#04101f] ${
                    slot.key.startsWith('platform_')
                      ? 'aspect-square'
                      : slot.key === 'game_placeholder'
                        ? 'aspect-[400/567]'
                        : 'aspect-[16/9]'
                  }`}
                >
                  {slot.url ? (
                    <img src={slot.url} alt={slotLabel(slot)} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted/60">
                      <IconImage className="h-6 w-6" />
                      <span className="text-[10px]">{t('assets.unset')}</span>
                    </div>
                  )}
                  {slot.isDefault && (
                    <span className="absolute left-1.5 top-1.5 border border-neon/50 bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-neon">
                      默认图
                    </span>
                  )}
                  {busyKey === slot.key && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Spinner className="h-5 w-5" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-bold text-white">{slotLabel(slot)}</p>
                    <span className="shrink-0 border border-line px-1.5 py-0.5 text-[10px] text-muted">
                      {slot.ratio}
                    </span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted">
                    {t('assets.recommend', { size: slot.ratio })}
                  </p>
                  <code className="truncate text-[10px] text-neon/70">{slot.key}</code>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                    <button
                      className="btn btn-ghost h-7 px-2 py-0 text-[11px]"
                      disabled={busyKey === slot.key}
                      onClick={() => {
                        pendingKey.current = slot.key;
                        fileRef.current?.click();
                      }}
                    >
                      <IconUpload className="h-3 w-3" /> {t('assets.upload')}
                    </button>
                    <button
                      className="btn btn-ghost h-7 px-2 py-0 text-[11px]"
                      disabled={busyKey === slot.key}
                      onClick={() => {
                        setEditing(slot);
                        // 外链编辑框只回填「自定义」地址，内置默认图不参与编辑
                        const custom = slot.custom || '';
                        setUrlValue(custom.startsWith('/uploads') ? '' : custom);
                      }}
                    >
                      {t('assets.url')}
                    </button>
                    {slot.custom && (
                      <button
                        className="flex h-7 items-center gap-1 border border-line px-2 text-[11px] font-bold text-muted transition-colors hover:border-[#ff5b7f] hover:text-[#ff5b7f]"
                        disabled={busyKey === slot.key}
                        onClick={() => clear(slot)}
                      >
                        <IconTrash className="h-3 w-3" /> {t('assets.restore')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md border-2 border-line bg-surface p-5 shadow-[6px_6px_0_0_rgba(0,0,0,.8)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white">{slotLabel(editing)}</h3>
                <p className="mt-1 text-[11px] text-muted">
                  {t('assets.urlHint')}
                </p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-muted hover:text-white"
                aria-label={t('assets.close')}
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
            <input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://example.com/banner.png"
              className="field mt-4"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-ghost text-xs" onClick={() => setEditing(null)}>
                {t('action.cancel')}
              </button>
              <button
                className="btn btn-primary text-xs"
                disabled={!urlValue.trim() || busyKey === editing.key}
                onClick={saveUrl}
              >
                {t('action.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
