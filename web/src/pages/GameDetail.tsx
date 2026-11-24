import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { GameCard } from '../components/GameCard';
import {
  IconArrowLeft,
  IconCalendar,
  IconDisc,
  IconFolder,
  IconGamepad,
  IconHeart,
  IconMonitor,
  IconPlay,
  IconStar,
  IconUsers,
} from '../components/Icons';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { EmptyState, GameCover, PageLoader, PlatformBadge } from '../components/ui';
import type { Game } from '../types';
import { formatBytes, formatCount, formatDate } from '../utils';

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-line/60 py-3 last:border-0">
      <span className="mt-0.5 text-muted">{icon}</span>
      <span className="w-20 shrink-0 text-xs font-bold text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm text-white/85">{value || '—'}</span>
    </div>
  );
}

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();

  const [game, setGame] = useState<Game | null>(null);
  const [related, setRelated] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favBusy, setFavBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api
      .get<{ game: Game; related: Game[] }>(`/games/${id}`)
      .then((res) => {
        if (!alive) return;
        setGame(res.game);
        setRelated(res.related);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : t('state.error')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const toggleFavorite = async () => {
    if (!user) {
      toast(t('game.loginToFavorite'), 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/game/${id}`)}`);
      return;
    }
    if (!game || favBusy) return;
    setFavBusy(true);
    try {
      const res = await api.post<{ favorited: boolean; favCount: number }>(
        `/games/${game.id}/favorite`,
      );
      setGame({ ...game, isFavorite: res.favorited, favCount: res.favCount });
      toast(res.favorited ? t('game.favoriteAdded') : t('game.favoriteRemoved'), 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('state.error'), 'error');
    } finally {
      setFavBusy(false);
    }
  };

  /**
   * 自助修复：ROM 还压在 zip 里时，浏览器端模拟器需要自己解压；中文 Windows
   * 打的包条目名是 GBK，解出乱码后找不到 ROM 就静默退回主菜单。
   * 让服务端把里面的 ROM 解出来单独登记，之后模拟器直接读裸文件。
   */
  const repairRom = async () => {
    if (!game || repairBusy) return;
    setRepairBusy(true);
    try {
      const res = await api.post<{ ok: boolean; game: Game | null }>(
        `/games/${game.id}/repair-rom`,
      );
      if (res.game) setGame(res.game);
      toast(t('game.repairOk'), 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('state.error'), 'error');
    } finally {
      setRepairBusy(false);
    }
  };

  if (loading) return <PageLoader label="LOADING" />;
  if (error || !game) {
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

  return (
    <div>
      {/* 背景 */}
      <div className="relative h-40 overflow-hidden border-b-2 border-line sm:h-52">
        {game.cover ? (
          <img src={game.cover} alt="" className="h-full w-full scale-110 object-cover opacity-[0.14] blur-2xl" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `radial-gradient(circle at 22% 30%, ${game.platformColor}2e, #050a1f 62%)`,
            }}
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
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none font-pixel text-[86px] leading-none text-white/[0.045] sm:right-6 sm:text-[128px]">
          {game.platformShort}
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
        {/* 头部信息 */}
        <div className="relative -mt-20 flex flex-col gap-5 sm:-mt-24 sm:flex-row sm:gap-7">
          {/* 与卡片一致：竖版封面 400:567，移动端占一半宽，不铺满整屏 */}
          <div className="w-[52%] max-w-[190px] shrink-0 sm:w-[200px] sm:max-w-none lg:w-[248px]">
            <div className="relative aspect-[3/4] overflow-hidden border-2 border-white/20 shadow-[8px_8px_0_0_rgba(0,0,0,.6)]">
              <GameCover game={game} />
            </div>
            <div className="mt-3 flex items-center justify-between border-2 border-line bg-panel px-2.5 py-2 text-[11px]">
              <span className="flex items-center gap-1 font-bold text-white/70">
                <IconPlay className="h-3 w-3" /> {formatCount(game.playCount)}
              </span>
              <span className="flex items-center gap-1 font-bold text-white/70">
                <IconHeart className="h-3 w-3" /> {formatCount(game.favCount)}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformBadge name={game.platformName} color={game.platformColor} />
              {game.featured && (
                <span className="inline-flex items-center gap-1 border border-[#ffd166]/40 bg-[#ffd166]/10 px-1.5 py-0.5 text-[10px] font-black text-[#ffd166]">
                  <IconStar className="h-2.5 w-2.5" /> {t('game.featured')}
                </span>
              )}
              {!game.hasRom && (
                <span
                  className={`border px-1.5 py-0.5 text-[10px] font-black ${
                    game.romMissing
                      ? 'border-[#ff5b7f]/40 bg-[#ff5b7f]/10 text-[#ff8fa8]'
                      : 'border-[#ffb020]/40 bg-[#ffb020]/10 text-[#ffb020]'
                  }`}
                >
                  {game.romMissing ? t('game.romLostBadge') : t('game.romPending')}
                </span>
              )}
            </div>

            <h1 className="mt-2 text-xl font-black leading-tight text-white sm:text-[26px] lg:text-[30px]">
              {game.title}
            </h1>

            <p className="mt-2 text-xs text-muted">
              {[game.year ? String(game.year) : '', game.developer, game.genre]
                .filter(Boolean)
                .join(' · ') || game.platformName}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {game.hasRom ? (
                <Link to={`/play/${game.id}`} className="btn btn-primary px-6 py-2.5 text-sm">
                  <IconPlay className="h-4 w-4" /> {t('action.play')}
                </Link>
              ) : (
                <span className="btn cursor-not-allowed border-line bg-panel/60 px-6 py-2.5 text-sm text-muted">
                  <IconPlay className="h-4 w-4" /> {t('game.notPlayable')}
                </span>
              )}

              <button
                onClick={toggleFavorite}
                disabled={favBusy}
                className={`btn px-4 py-2.5 text-sm ${
                  game.isFavorite
                    ? 'border-neon bg-neon/15 text-neon'
                    : 'border-line bg-panel text-white/85'
                }`}
              >
                <IconHeart className="h-4 w-4" filled={game.isFavorite} />
                {game.isFavorite ? t('action.favorited') : t('action.favorite')}
              </button>

              <button
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(window.location.href)
                    .then(() => toast(t('game.share'), 'success'))
                    .catch(() => toast(t('state.error'), 'error'));
                }}
                className="btn border-line bg-panel px-4 py-2.5 text-sm text-white/70"
              >
                {t('game.share')}
              </button>
            </div>

            {!game.hasRom && game.romMissing && (
              <p className="mt-2.5 border-l-2 border-[#ff5b7f]/60 pl-2 text-[11px] leading-relaxed text-[#ff8fa8]/85">
                {t('game.romLostDesc')}
              </p>
            )}

            {game.hasRom && game.romPacked && (
              // 次要操作：和「收藏 / 分享」同级，不抢「开始游戏」的注意力；
              // 大多数压缩包本来就能跑，这里只是给「打不开」的人一个自助出口
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-l-2 border-line pl-2.5">
                <p className="text-[11px] leading-relaxed text-white/35">{t('game.repairHint')}</p>
                <button
                  onClick={repairRom}
                  disabled={repairBusy}
                  className="border border-line bg-panel/60 px-2 py-1 text-[11px] font-bold text-white/60 transition-colors hover:border-neon hover:text-neon disabled:opacity-50"
                >
                  {repairBusy ? t('game.repairing') : t('game.repairRom')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 正文 */}
        <div className="mt-8 grid gap-6 pb-14 lg:grid-cols-[1fr_320px] lg:gap-8">
          <div className="space-y-6">
            <section className="pixel-frame">
              <div className="flex items-center gap-2 border-b-2 border-line px-4 py-2.5">
                <span className="h-3 w-1 bg-neon" />
                <h2 className="text-sm font-black tracking-wide text-white">{t('game.about')}</h2>
              </div>
              <div className="px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">
                  {game.description || t('game.noDesc')}
                </p>
              </div>
            </section>

            <section className="pixel-frame">
              <div className="flex items-center gap-2 border-b-2 border-line px-4 py-2.5">
                <span className="h-3 w-1 bg-cyan" />
                <h2 className="text-sm font-black tracking-wide text-white">{t('game.specs')}</h2>
              </div>
              <div className="px-4 py-1">
                <InfoRow icon={<IconMonitor className="h-4 w-4" />} label={t('game.platform')} value={game.platformName} />
                <InfoRow
                  icon={<IconCalendar className="h-4 w-4" />}
                  label={t('game.year')}
                  value={game.year ? String(game.year) : t('game.unknown')}
                />
                <InfoRow icon={<IconGamepad className="h-4 w-4" />} label={t('game.developer')} value={game.developer} />
                <InfoRow icon={<IconDisc className="h-4 w-4" />} label={t('game.publisher')} value={game.publisher} />
                <InfoRow icon={<IconStar className="h-4 w-4" />} label={t('game.genre')} value={game.genre} />
                <InfoRow
                  icon={<IconUsers className="h-4 w-4" />}
                  label={t('game.players')}
                  value={t('game.playersUnit', { n: game.players })}
                />
                <InfoRow
                  icon={<IconFolder className="h-4 w-4" />}
                  label="ROM"
                  value={
                    game.hasRom
                      ? `${game.romName} · ${formatBytes(game.romSize)}`
                      : game.romMissing
                        ? t('game.romLostDesc')
                        : t('game.romMissing')
                  }
                />
                <InfoRow
                  icon={<IconCalendar className="h-4 w-4" />}
                  label={t('game.released')}
                  value={formatDate(game.createdAt)}
                />
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="pixel-frame p-4">
              <h3 className="flex items-center gap-2 text-sm font-black text-white">
                <IconGamepad className="h-4 w-4 text-neon" /> {t('game.howto')}
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-white/60">
                <li className="flex gap-2">
                  <span className="text-neon">▸</span> {t('game.tip1')}
                </li>
                <li className="flex gap-2">
                  <span className="text-neon">▸</span> {t('game.tip2')}
                </li>
                <li className="flex gap-2">
                  <span className="text-neon">▸</span> {t('game.tip3')}
                </li>
              </ul>
              <div className="mt-4 flex items-center gap-2 border border-line bg-[#0f0f16] px-2.5 py-2 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 animate-blink bg-[#3ddc84]" />
                {t('game.fullscreen')}
              </div>
            </div>

            {game.genre && (
              <div className="pixel-frame p-4">
                <h3 className="text-xs font-black tracking-wider text-muted">TAGS</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[game.genre, game.platformShort, `${game.players}P`, game.year ? `${game.year}` : '']
                    .filter(Boolean)
                    .map((tag) => (
                      <span key={tag} className="border border-line bg-[#0f0f16] px-2 py-1 text-[11px] text-white/60">
                        #{tag}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <section className="border-t-2 border-line py-8">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-4 w-1 bg-neon" />
              <h2 className="text-lg font-black text-white">{t('game.relatedTitle')}</h2>
              <span className="text-[11px] text-muted">/ {game.platformName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {related.map((g, i) => (
                <GameCard key={g.id} game={g} index={i} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
