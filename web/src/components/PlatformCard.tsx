import { Link } from 'react-router-dom';
import { useAsset } from '../assets';
import { useI18n } from '../i18n';
import { PixelCard, YearChip } from './PixelCard';

export type PlatformCardData = {
  id: string;
  short: string;
  color: string;
  count: number;
};

/**
 * 平台主色直接当字色会偏暗（如 gba 的 #5b4bcd），压在深色封面插画上读不清。
 * 这里按相对亮度做有限次「向白色混合」，只提亮不够亮的颜色，够亮的原样返回。
 */
function accentFor(hex: string) {
  const matched = /^#?([\da-f]{6})$/i.exec(hex || '');
  const rgb = matched ? [0, 2, 4].map((i) => parseInt(matched[1].slice(i, i + 2), 16)) : [255, 255, 255];
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const brightness = () => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  for (let step = 0; step < 8 && brightness() < 0.38; step += 1) {
    for (let i = 0; i < 3; i += 1) rgb[i] = Math.round(rgb[i] + (255 - rgb[i]) * 0.12);
  }
  return {
    color: `rgb(${rgb.join(', ')})`,
    glow: `rgba(${rgb.join(', ')}, 0.45)`,
  };
}

/**
 * 平台卡片：275 × 401（含 3px 像素边框），上方 275 × 275 方图，下方 126 文字区。
 * 文字区：简称（左，大） + 全称（右，小，同一行）；简介居右；年份方框居左下，厂商居右下，不额外占行。
 */
export function PlatformCard({ platform }: { platform: PlatformCardData }) {
  const { t, tx } = useI18n();
  const art = useAsset(`platform_${platform.id}`);

  const name = tx(`platform.${platform.id}.name`) || platform.short;
  const sub = tx(`platform.${platform.id}.sub`);
  const desc = tx(`platform.${platform.id}.desc`);
  const year = tx(`platform.${platform.id}.year`);
  const vendor = tx(`platform.${platform.id}.vendor`);
  const count = platform.count || 0;
  const accent = accentFor(platform.color);

  return (
    <Link
      to={`/library?platform=${encodeURIComponent(platform.id)}`}
      className="group block h-full w-full"
      title={name}
    >
      <PixelCard>
        <div className="card-art card-art--platform border-b-2 border-line">
          {art ? (
            <img
              src={art}
              alt={name}
              loading="lazy"
              className="pixel-img h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
            />
          ) : (
            <div
              className="flex h-full w-full items-end justify-between p-2.5 platform-art-fallback"
              style={{
                background: `radial-gradient(circle at 30% 18%, ${platform.color}44, var(--art-fallback, #04101f) 68%)`,
              }}
            >
              <span
                className="font-pixel text-[16px] leading-none tracking-tight"
                style={{ color: platform.color, textShadow: '3px 3px 0 rgba(0,0,0,.6)' }}
              >
                {platform.short}
              </span>
              <span
                className="h-5 w-5 border-2"
                style={{ borderColor: `${platform.color}88`, background: `${platform.color}22` }}
              />
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 to-transparent opacity-70" />

          {/* 游戏数量：右下角标签，0 款不显示，完全不占文字区 */}
          {count > 0 && (
            <span
              className="count-badge"
              style={{ color: accent.color, borderColor: accent.color, textShadow: `0 0 8px ${accent.glow}` }}
            >
              {t('platform.gamesBadge', { n: count })}
            </span>
          )}
        </div>

        <div className="card-body card-body--platform">
          {/* 简称 + 全称同一行，全称小字居右 */}
          <div className="flex items-baseline justify-between gap-1.5">
            <h3 className="card-title card-title--platform min-w-0 truncate text-white transition-colors group-hover:text-neon">
              {name}
            </h3>
            {sub && (
              <span className="card-sub min-w-0 shrink-0 truncate text-right text-white/35">
                {sub}
              </span>
            )}
          </div>

          {/* 简介：左对齐，字号只比名称小一档，颜色与名称一致 */}
          <p className="card-desc card-desc--platform mt-1.5 text-white">{desc}</p>

          {/* 底行：年份方框居左，厂商居右，同一行不再多占高度 */}
          <div className="mt-auto flex items-end justify-between gap-2">
            {year ? <YearChip>{year}</YearChip> : <span />}
            <span className="card-sub min-w-0 truncate text-right text-white/40">{vendor}</span>
          </div>
        </div>
      </PixelCard>
    </Link>
  );
}
