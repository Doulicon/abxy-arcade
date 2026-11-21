import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { Series } from '../types';
import { IconPlay, IconStar } from './Icons';
import { PixelCard } from './PixelCard';

/** 把 "动作 / 射击" 这类自由填写拆成多个类型标签 */
function splitGenres(genre: string) {
  return genre
    .split(/[,，、/|·;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 系列卡片：与游戏卡同规格，上方竖版封面（400:567），下方名称 + 类型标签。
 * 平台标签在图片右下角（与游戏卡片一致），精选星标左上。
 */
export function SeriesCard({ series, index = 0 }: { series: Series; index?: number }) {
  const genres = splitGenres(series.genre).slice(0, 2);
  const platformName = series.platformShort || series.platform || '';

  return (
    <Link
      to={`/series/${series.id}`}
      className="group block h-full animate-popin"
      style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}
      title={series.name}
    >
      <PixelCard>
        <div className="card-art card-art--game">
          <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.06]">
            {series.cover ? (
              <img
                src={series.cover}
                alt={series.name}
                loading="lazy"
                className="pixel-img h-full w-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center font-pixel text-[20px] text-white/30"
                style={{
                  background:
                    'radial-gradient(circle at 30% 20%, rgba(76,201,255,.18), #04101f 70%)',
                }}
              >
                SERIES
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-90" />

          {/* 精选星标：左上角，与游戏卡片一致 */}
          {series.featured && (
            <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
              <span className="inline-flex items-center border border-[#ffd16666] bg-[#ffd1661a] px-1 py-0.5 text-[9px] font-black text-[#ffd166]">
                <IconStar className="h-2.5 w-2.5" strokeWidth={2.4} />
              </span>
            </div>
          )}

          {/* 平台标签：图片右下角，样式与游戏卡片完全一致 */}
          {platformName && (
            <span
              className="platform-badge"
              style={{
                color: series.platformColor || '#4cc9ff',
                borderColor: `${series.platformColor || '#4cc9ff'}80`,
                background: 'rgba(4,10,24,.86)',
                textShadow: `0 0 8px ${series.platformColor || '#4cc9ff'}55`,
              }}
            >
              {platformName}
            </span>
          )}

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-btn-shape flex h-10 w-10 translate-y-2 items-center justify-center border-2 border-neon bg-neon/90 text-[#04101f] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              <IconPlay className="ml-0.5 h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="card-body card-body--game">
          <h3 className="card-title card-title--game line-clamp-2 text-white transition-colors group-hover:text-neon">
            {series.name}
          </h3>

          {genres.length > 0 && (
            <div className="flex shrink-0 flex-nowrap gap-1 overflow-hidden" title={series.genre}>
              {genres.map((g) => (
                <span key={g} className="genre-chip">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </PixelCard>
    </Link>
  );
}
