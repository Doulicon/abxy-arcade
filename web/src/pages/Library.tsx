import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { GameCard } from '../components/GameCard';
import { SeriesCard } from '../components/SeriesCard';
import { IconSearch } from '../components/Icons';
import { EmptyState, Pagination, SearchEmpty, SkeletonGrid } from '../components/ui';
import { useI18n } from '../i18n';
import type { Paged, Platform, Game, Series } from '../types';

export default function Library() {
  const { t, tx } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const platform = params.get('platform') || '';
  const sort = params.get('sort') || 'hot';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [data, setData] = useState<Paged<Game> | null>(null);
  const [loading, setLoading] = useState(true);

  const SORTS = [
    { id: 'hot', label: t('library.sort.hot') },
    { id: 'latest', label: t('library.sort.latest') },
    { id: 'favorites', label: t('library.sort.favorites') },
    { id: 'title', label: t('library.sort.title') },
  ];

  useEffect(() => {
    api
      .get<{ items: Platform[] }>('/platforms')
      .then((res) => setPlatforms(res.items))
      .catch(() => undefined);
  }, []);

  // 系列列表：随平台筛选变化；无搜索时才参与展示
  useEffect(() => {
    const sp = new URLSearchParams();
    if (platform) sp.set('platform', platform);
    api
      .get<{ items: Series[] }>(`/series${sp.toString() ? `?${sp.toString()}` : ''}`)
      .then((res) => setSeries(res.items))
      .catch(() => setSeries([]));
  }, [platform]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const sp = new URLSearchParams({ sort, page: String(page), pageSize: '24' });
    if (q) sp.set('q', q);
    if (platform) sp.set('platform', platform);
    api
      .get<Paged<Game>>(`/games?${sp.toString()}`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, platform, sort, page]);

  const patch = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params);
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      if (!('page' in next)) sp.delete('page');
      setParams(sp, { replace: true });
    },
    [params, setParams],
  );

  const activePlatform = platforms.find((p) => p.id === platform);
  const total = data?.total ?? 0;
  const platformName = activePlatform ? tx(`platform.${activePlatform.id}.name`) || activePlatform.short : '';

  return (
    <div className="fade-up mx-auto max-w-shell px-4 py-8 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-4">
        <div>
          <h1 className="font-pixel text-[14px] tracking-wide text-white">
            {activePlatform ? platformName : t('library.allGames')}
          </h1>
          <p className="mt-2 text-[11px] font-bold text-muted">
            {q ? `${t('library.searching', { q })} · ${t('library.matched', { n: total })}` : t('library.count', { n: total })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => patch({ sort: s.id === 'hot' ? null : s.id })}
              className={`chip ${sort === s.id ? 'chip-active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 平台筛选 */}
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => patch({ platform: null })}
          className={`chip ${!platform ? 'chip-active' : ''}`}
        >
          {t('action.all')}
          <span className="text-[10px] opacity-60">
            {platforms.reduce((a, p) => a + (p.count || 0), 0)}
          </span>
        </button>
        {platforms
          .filter((p) => (p.count || 0) > 0)
          .map((p) => (
            <button
              key={p.id}
              onClick={() => patch({ platform: p.id })}
              className={`chip ${platform === p.id ? 'chip-active' : ''}`}
            >
              <span className="h-1.5 w-1.5" style={{ background: p.color }} aria-hidden />
              {p.short}
              <span className="text-[10px] opacity-60">{p.count}</span>
            </button>
          ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <SkeletonGrid count={12} />
        ) : !data || (data.items.length === 0 && (!series.length || q)) ? (
          q ? (
            <SearchEmpty keyword={q} />
          ) : (
            <EmptyState
              title={tx('empty.library.title')}
              description={t('library.emptyDesc')}
              action={
                platform ? (
                  <button className="btn btn-ghost" onClick={() => patch({ platform: null })}>
                    <IconSearch className="h-4 w-4" /> {t('library.allPlatforms')}
                  </button>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            {/* 系列卡片与无系列游戏混排在同一个网格里（无搜索时） */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {!q &&
                series.map((s, i) => (
                  <SeriesCard key={`s-${s.id}`} series={s} index={i} />
                ))}
              {data.items.map((game, i) => (
                <GameCard key={game.id} game={game} index={i} />
              ))}
            </div>
            {data.totalPages > 1 && (
              <div className="mt-8">
                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  onChange={(p) => patch({ page: String(p) })}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
