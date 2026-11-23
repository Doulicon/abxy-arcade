import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { GameCard } from '../components/GameCard';
import { IconHeart, IconSparkle } from '../components/Icons';
import { EmptyState, Pagination, SkeletonGrid } from '../components/ui';
import { useI18n } from '../i18n';
import type { Game, Paged } from '../types';

type Tab = 'favorites' | 'recent';

export default function Favorites() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('favorites');
  const [items, setItems] = useState<Game[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (tab === 'favorites') {
        const res = await api.get<Paged<Game>>(`/me/favorites?page=${page}&pageSize=24`);
        setItems(res.items);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      } else {
        const res = await api.get<{ items: Game[] }>('/me/recent');
        setItems(res.items);
        setTotalPages(1);
        setTotal(res.items.length);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('state.error'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user, tab, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-5">
        <SkeletonGrid count={6} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <EmptyState
          icon={<IconHeart className="h-7 w-7" />}
          title={t('fav.loginTitle')}
          description={t('fav.loginDesc')}
          action={
            <Link to="/login?redirect=%2Ffavorites" className="btn btn-primary">
              {t('fav.goLogin')}
            </Link>
          }
        />
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'favorites', label: t('nav.favorites'), icon: <IconHeart className="h-3.5 w-3.5" /> },
    { id: 'recent', label: t('fav.tabRecent'), icon: <IconSparkle className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <h1 className="flex items-center gap-2 font-pixel text-[15px] text-white sm:text-[18px]">
            <span className="inline-block h-5 w-1 bg-neon" />
            {t('fav.title')}
          </h1>
          <p className="mt-2 text-[11px] text-muted">
            {t(tab === 'favorites' ? 'fav.countFav' : 'fav.countRecent', { n: total })}
          </p>
        </div>

        <div className="flex items-center gap-1 border-2 border-line bg-panel/60 p-0.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-btn-shape flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors ${
                tab === item.id ? 'bg-neon text-[#04101f]' : 'text-muted hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <SkeletonGrid count={8} />
        ) : error ? (
          <EmptyState
            title={t('state.error')}
            description={error}
            action={
              <button className="btn btn-ghost" onClick={load}>
                {t('action.retry')}
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={
              tab === 'favorites' ? (
                <IconHeart className="h-7 w-7" />
              ) : (
                <IconSparkle className="h-7 w-7" />
              )
            }
            title={tab === 'favorites' ? t('fav.empty') : t('fav.emptyRecent')}
            description={tab === 'favorites' ? t('fav.emptyDesc') : t('fav.emptyRecentDesc')}
            action={
              <Link to="/library" className="btn btn-primary">
                {t('fav.browse')}
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {items.map((game, i) => (
                <GameCard key={game.id} game={game} index={i} />
              ))}
            </div>
            {tab === 'favorites' && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}
