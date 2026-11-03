import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PlatformCard } from '../components/PlatformCard';
import { EmptyState, PageLoader } from '../components/ui';
import { useI18n } from '../i18n';
import type { Platform } from '../types';

/** 游戏平台总览：一排排平台卡片，点进去就是该平台的游戏列表 */
export default function Platforms() {
  const { t, tx } = useI18n();
  const [items, setItems] = useState<Platform[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ items: Platform[]; total: number }>('/platforms')
      .then((res) => {
        if (!alive) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="mx-auto max-w-shell px-5 py-20">
        <EmptyState title={t('state.error')} description={t('library.emptyDesc')} />
      </div>
    );
  }

  if (!items) return <PageLoader label={t('state.loading')} />;

  return (
    <div className="fade-up">
      <section className="border-b-2 border-line bg-[radial-gradient(ellipse_at_20%_0%,rgba(76,201,255,.16),transparent_60%)]">
        <div className="mx-auto w-full max-w-shell px-5 py-12">
          <h1 className="section-title section-title--page">{tx('home.platforms.title')}</h1>
          <p className="mt-3 max-w-xl text-[13px] leading-[1.9] text-white/70">
            {tx('home.platforms.desc')}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="border border-line bg-panel px-2 py-1">
              {t('library.count', { n: total })}
            </span>
            <span className="border border-line bg-panel px-2 py-1">
              {t('platforms.count', { n: items.length })}
            </span>
            <Link to="/library" className="text-neon hover:underline">
              {tx('home.viewAll')} ›
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1520px] px-4 py-10 sm:px-5">
        <div className="platform-grid mx-auto">
          {items.map((p) => (
            <PlatformCard key={p.id} platform={{ ...p, count: p.count || 0 }} />
          ))}
        </div>
      </section>
    </div>
  );
}
