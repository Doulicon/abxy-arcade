import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { Game } from '../types';
import { IconPlay, IconStar } from './Icons';
import { PixelCard } from './PixelCard';
import { GameCover } from './ui';

/** 把 "动作 / 射击、街机" 这类自由填写拆成多个类型标签 */
function splitGenres(genre: string) {
  return genre
    .split(/[,，、/|·;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 游戏卡片（3:4，整张卡就是封面）：
 *   左上 —— 游戏类型标签 + 精选星标
 *   右上 —— 缺 ROM 提示
 *   下沿 —— 一条模糊带（只模糊身下的封面 + 轻薄压暗），游戏名居中一行，超长省略
 *   右下 —— 平台标签
 *
 * 封面一律 object-cover 铺满整卡：竖版更长的封面上下适当裁掉，1:1 或横图同样铺满，
 * 卡片尺寸与文字位置完全不受封面比例影响，网格永远是齐的。
 */
export function GameCard({ game, index = 0 }: { game: Game; index?: number }) {
  const { t } = useI18n();
  // 左上角只放第一枚类型标签（空间有限），完整内容看 hover title
  const genres = splitGenres(game.genre).slice(0, 1);

  return (
    <Link
      to={`/game/${game.id}`}
      className="group block h-full animate-popin"
      style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}
      title={game.title}
    >
      <PixelCard>
        <div className="card-art card-art--game">
          <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.06]">
            <GameCover game={game} className="pixel-img" fill />
          </div>

          {/* hover 时整体轻压暗，给中间的播放按钮做衬底 */}
          <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/25" />

          {/* 左上角：游戏类型标签 + 精选星标 */}
          <div className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-3.5rem)] items-center gap-1">
            {genres.length > 0 && (
              <span className="genre-badge" title={game.genre}>
                {genres[0]}
              </span>
            )}
            {game.featured && (
              <span className="inline-flex shrink-0 items-center border border-[#ffd16666] bg-[#ffd1661a] px-1 py-0.5 text-[9px] font-black text-[#ffd166]">
                <IconStar className="h-2.5 w-2.5" strokeWidth={2.4} />
              </span>
            )}
          </div>

          {!game.hasRom && (
            <div className="absolute right-1.5 top-1.5 border border-[#ffb54766] bg-black/75 px-1 py-0.5 text-[8px] font-bold text-amber">
              {t('game.noRom')}
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-btn-shape flex h-10 w-10 translate-y-2 items-center justify-center border-2 border-neon bg-neon/90 text-[#04101f] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              <IconPlay className="ml-0.5 h-4 w-4" />
            </span>
          </div>

          {/* 底部模糊带：游戏名居中，平台标签压在右下角 */}
          <div className="card-scrim">
            <h3 className="card-title card-title--game block w-full truncate text-center text-white transition-colors group-hover:text-neon">
              {game.title}
            </h3>
            <span
              className="platform-badge"
              style={{
                color: game.platformColor,
                borderColor: `${game.platformColor}80`,
                textShadow: `0 1px 2px rgba(4,10,24,.5), 0 0 8px ${game.platformColor}55`,
              }}
            >
              {game.platformShort}
            </span>
          </div>
        </div>
      </PixelCard>
    </Link>
  );
}
