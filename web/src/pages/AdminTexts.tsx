import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { IconCheck, IconSearch, IconText, IconTrash } from '../components/Icons';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import type { AdminTextsData } from '../types';

/**
 * 站点文案管理：按语言分别编辑 Banner、平台卡片、页脚等展示文字。
 * 留空 = 删除覆盖，回到内置文案；某语言完全没配时回退中文。
 */
export default function AdminTexts() {
  const toast = useToast();
  const { locale: siteLocale, setLocale, reloadTexts, t, tx } = useI18n();

  const [data, setData] = useState<AdminTextsData | null>(null);
  const [lang, setLang] = useState<string>(siteLocale);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(
    async (keepLang?: string) => {
      setLoading(true);
      try {
        const res = await api.get<AdminTextsData>('/admin/texts');
        setData(res);
        const nextLang = keepLang || lang;
        setDraft(res.values[nextLang] || res.values[res.defaultLocale] || {});
        setDirty(false);
      } catch (e: any) {
        toast(e?.message || t('texts.toast.loadFail'), 'error');
      } finally {
        setLoading(false);
      }
    },
    [lang, toast, t],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchLang = (id: string) => {
    if (dirty && !window.confirm(t('texts.confirmSwitch'))) return;
    setLang(id);
    setDraft(data?.values[id] || {});
    setDirty(false);
  };

  const setValue = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/admin/texts', { locale: lang, values: draft });
      await load(lang);
      if (lang === siteLocale) await reloadTexts();
      toast(t('texts.toast.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || t('texts.toast.saveFail'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const resetAll = async () => {
    if (!window.confirm(t('texts.confirmReset'))) return;
    setBusy(true);
    try {
      await api.post('/admin/texts/reset', { locale: lang });
      await load(lang);
      if (lang === siteLocale) await reloadTexts();
      toast(t('texts.toast.restored'), 'info');
    } catch (e: any) {
      toast(e?.message || t('texts.toast.opFail'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const resetField = async (key: string) => {
    setBusy(true);
    try {
      await api.post('/admin/texts/reset', { locale: lang, key });
      await load(lang);
      if (lang === siteLocale) await reloadTexts();
    } catch (e: any) {
      toast(e?.message || t('texts.toast.opFail'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** 字段名：先查 i18n，再按 platform.<id>.<field> 拼平台名 */
  const fieldLabel = (key: string, fallback: string) => {
    const direct = t(`xf.${key}`);
    if (direct !== `xf.${key}`) return direct;
    const m = key.match(/^platform\.([^.]+)\.([a-z]+)$/);
    if (m) {
      const suffixKey = `xf.pf.${m[2]}`;
      const suffix = t(suffixKey);
      if (suffix !== suffixKey) {
        const name = tx(`platform.${m[1]}.name`) || m[1];
        return `${name} · ${suffix}`;
      }
    }
    return fallback;
  };

  const groupLabel = (label: string) => {
    if (label.startsWith('平台卡片')) {
      const [, suffix] = label.split(' · ');
      return suffix ? `${t('texts.group.platformCard')} · ${suffix}` : t('texts.group.platformCard');
    }
    const map: Record<string, string> = {
      品牌: t('texts.group.brand'),
      '首页 Banner': t('texts.group.hero'),
      首页分区: t('texts.group.home'),
      空状态: t('texts.group.empty'),
      页脚: t('texts.group.footer'),
    };
    return map[label] || label;
  };

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.groups;
    return data.groups
      .map((g) => ({
        ...g,
        fields: g.fields.filter(
          (f) =>
            f.key.toLowerCase().includes(q) ||
            f.label.toLowerCase().includes(q) ||
            (draft[f.key] || '').toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.fields.length > 0);
  }, [data, query, draft]);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-16 text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const overridden = new Set(data.overridden[lang] || []);

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center gap-2 border-2 border-line bg-panel/60 px-4 py-3">
        <IconText className="h-4 w-4 text-neon" />
        <p className="flex-1 text-[11px] leading-relaxed text-muted">
          {t('texts.intro')}
        </p>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost h-8 px-3 py-0 text-[11px]"
        >
          {t('texts.preview')}
        </a>
      </div>

      {/* 语言切换 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {data.locales.map((l) => (
          <button
            key={l.id}
            onClick={() => switchLang(l.id)}
            className={`chip ${lang === l.id ? 'chip-active' : ''}`}
          >
            {l.label}
            {(data.overridden[l.id] || []).length > 0 && (
              <span className="text-[9px] opacity-70">{(data.overridden[l.id] || []).length}</span>
            )}
          </button>
        ))}

        <div className="relative ml-auto">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('texts.search')}
            className="field h-8 w-40 py-0 pl-8 text-[11px] sm:w-56"
          />
        </div>
      </div>

      {lang !== data.defaultLocale && (
        <p className="border-l-2 border-amber bg-amber/5 px-3 py-2 text-[11px] text-amber">
          {t('texts.editing', { lang: data.locales.find((l) => l.id === lang)?.label || lang })}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.label} className="border-2 border-line bg-panel/40">
          <div className="flex items-center gap-2 border-b-2 border-line bg-panel px-3 py-2">
            <span className="h-3 w-1 bg-neon" />
            <h3 className="text-[12px] font-black text-white">{groupLabel(group.label)}</h3>
            <span className="text-[10px] text-muted">{group.fields.length}</span>
          </div>

          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {group.fields.map((field) => {
              const value = draft[field.key] ?? '';
              const isOverridden = overridden.has(field.key);
              return (
                <div key={field.key} className={field.multiline ? 'sm:col-span-2' : ''}>
                  <div className="mb-1 flex items-center gap-2">
                    <label className="text-[11px] font-bold text-muted">
                      {fieldLabel(field.key, field.label)}
                    </label>
                    {isOverridden && (
                      <span className="border border-neon/40 bg-neon/10 px-1 text-[9px] text-neon">
                        {t('texts.changed')}
                      </span>
                    )}
                    <button
                      onClick={() => resetField(field.key)}
                      disabled={busy || !isOverridden}
                      className="ml-auto flex items-center gap-0.5 text-[10px] text-white/30 transition-colors enabled:hover:text-[#ff8fa8] disabled:opacity-30"
                      title={t('texts.defaultTitle')}
                    >
                      <IconTrash className="h-2.5 w-2.5" /> {t('texts.default')}
                    </button>
                  </div>

                  {field.multiline ? (
                    <textarea
                      value={value}
                      maxLength={field.max || 260}
                      rows={2}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className="field resize-y text-[12px] leading-relaxed"
                    />
                  ) : (
                    <input
                      value={value}
                      maxLength={field.max || 120}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className="field py-2 text-[12px]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p className="py-10 text-center text-[12px] text-muted">{t('texts.noMatch')}</p>
      )}

      {/* 保存条 */}
      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 border-2 border-line bg-surface/95 px-3 py-2.5 backdrop-blur">
        <span className="text-[11px] text-muted">
          {t('texts.current', { lang: data.locales.find((l) => l.id === lang)?.label || lang })}
          {dirty && <span className="ml-2 text-amber">{t('texts.dirty')}</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {lang === siteLocale && (
            <button
              className="btn btn-ghost h-8 px-3 py-0 text-[11px]"
              onClick={() => setLocale(lang as typeof siteLocale)}
              disabled={busy}
            >
              <IconCheck className="h-3 w-3" /> {t('texts.setLocale')}
            </button>
          )}
          <button
            className="btn btn-ghost h-8 px-3 py-0 text-[11px]"
            onClick={resetAll}
            disabled={busy}
          >
            {t('texts.resetAll')}
          </button>
          <button
            className="btn btn-primary h-8 px-4 py-0 text-[11px]"
            onClick={save}
            disabled={busy || !dirty}
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : null} {t('texts.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
