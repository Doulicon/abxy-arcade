import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { GameCard } from '../components/GameCard';
import { IconArrowLeft } from '../components/Icons';
import { useI18n } from '../i18n';
import { EmptyState, PageLoader } from '../components/ui';
import type { Game, Series } from '../types';

export default function SeriesDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [series, setSeries] = useState<Series | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api
      .get<{ series: Series; games: Game[] }>(`/series/${id}`)
      .then((res) => {
        if (!alive) return;
        setSeries(res.series);
        setGames(res.games);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : t('state.error')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) return <PageLoader label="LOADING" />;
  if (error || !series) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          title={t('state.notFound')}
          description={error || t('state.notFoundDesc')}
          action={
            <Link to="/" className="btn btn-primary">
              {t('nav.home')}
            </Link>
          }
        />
      </div>
    );
  }

  const genres = series.genre
    .split(/[,，、/|·;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="fade-up">
      {/* 系列头部横幅 */}
      <div className="relative h-44 overflow-hidden border-b-2 border-line sm:h-56">
        {series.cover ? (
          <img
            src={series.cover}
            alt=""
            className="h-full w-full scale-110 object-cover opacity-[0.16] blur-2xl"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: 'radial-gradient(circle at 22% 30%, rgba(76,201,255,.2), #050a1f 62%)' }}
          />
        )}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none font-pixel text-[64px] leading-none text-white/[0.05] sm:right-6 sm:text-[100px]">
          {series.gameCount}
        </span>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-transparent to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 top-4 flex items-center gap-1.5 border-2 border-white/15 bg-black/50 px-2.5 py-1.5 text-xs font-bold text-white/80 backdrop-blur transition-colors hover:border-neon hover:text-neon"
        >
          <IconArrowLeft className="h-3.5 w-3.5" /> {t('action.back')}
        </button>
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-5">
        <div className="relative -mt-16 flex flex-col gap-5 sm:-mt-20 sm:flex-row sm:items-end sm:gap-7">
          <div className="w-[52%] max-w-[190px] shrink-0 sm:w-[200px] sm:max-w-none lg:w-[248px]">
            <div className="relative aspect-[400/567] overflow-hidden border-2 border-white/20 shadow-[8px_8px_0_0_rgba(0,0,0,.6)]">
              {series.cover ? (
                <img src={series.cover} alt={series.name} className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center font-pixel text-[28px] text-white/30"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 20%, rgba(76,201,255,.18), #04101f 70%)',
                  }}
                >
                  SERIES
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              {genres.map((g) => (
                <span
                  key={g}
                  className="border border-neon/40 bg-neon/10 px-1.5 py-0.5 text-[10px] font-black text-neon"
                >
                  {g}
                </span>
              ))}
              <span className="border border-line bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-black text-white/60">
                {t('series.gameCount', { n: series.gameCount })}
              </span>
            </div>

            <h1 className="mt-2 text-xl font-black leading-tight text-white sm:text-[26px] lg:text-[30px]">
              {series.name}
            </h1>

            {series.description && (
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-7 text-white/70">
                {series.description}
              </p>
            )}
          </div>
        </div>

        {/* 系列游戏列表 */}
        <section className="pb-14 pt-8">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-4 w-1 bg-neon" />
            <h2 className="text-lg font-black text-white">{t('series.games')}</h2>
            <span className="text-[11px] text-muted">/ {series.gameCount}</span>
          </div>

          {games.length === 0 ? (
            <EmptyState title={t('series.empty')} description={t('series.emptyDesc')} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {games.map((game, i) => (
                <GameCard key={game.id} game={game} index={i} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
