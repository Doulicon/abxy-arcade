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
 * 游戏卡片（竖版 3:4 + 毛玻璃标题板）：
 *   左上 —— 精选星标（+ 缺 ROM 提示在右上）
 *   右下 —— 平台标签（压在封面角上）
 *   底部 —— 整块留白做成毛玻璃板：游戏名正中一行，超长省略；
 *           游戏类型标签压在整张卡片的右下角
 *
 * 整卡垫一层封面自身的模糊放大版（PixelCard 的 bgSrc），所以封面无论是
 * 1:1 方图、N64 横图还是竖版，露出来的留白和底部毛玻璃板质感完全一致；
 * 封面比例与牌面差 15% 以上时自动改为完整显示，不裁切 —— 判断在 GameCover 里。
 */
export function GameCard({ game, index = 0 }: { game: Game; index?: number }) {
  const { t } = useI18n();
  // 只放第一枚类型标签（右下角空间有限），完整内容看 hover title
  const genres = splitGenres(game.genre).slice(0, 1);

  return (
    <Link
      to={`/game/${game.id}`}
      className="group block h-full animate-popin"
      style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}
      title={game.title}
    >
      <PixelCard bgSrc={game.cover || undefined}>
        <div className="card-art card-art--game">
          <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.06]">
            <GameCover game={game} className="pixel-img" echo={false} />
          </div>

          {/* hover 时整体轻压暗，给中间的播放按钮做衬底；静态不影响留白观感 */}
          <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/25" />

          {/* 左上角：精选星标（类型标签已移到整卡右下角） */}
          {game.featured && (
            <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
              <span className="inline-flex shrink-0 items-center border border-[#ffd16666] bg-[#ffd1661a] px-1 py-0.5 text-[9px] font-black text-[#ffd166]">
                <IconStar className="h-2.5 w-2.5" strokeWidth={2.4} />
              </span>
            </div>
          )}

          {/* 右下角：平台标签（压在封面角上，毛玻璃底） */}
          <span
            className="platform-badge"
            style={{
              color: game.platformColor,
              borderColor: `${game.platformColor}80`,
              textShadow: `0 0 8px ${game.platformColor}55`,
            }}
          >
            {game.platformShort}
          </span>

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-btn-shape flex h-10 w-10 translate-y-2 items-center justify-center border-2 border-neon bg-neon/90 text-[#04101f] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              <IconPlay className="ml-0.5 h-4 w-4" />
            </span>
          </div>

          {!game.hasRom && (
            <div className="absolute right-1.5 top-1.5 border border-[#ffb54766] bg-black/75 px-1 py-0.5 text-[8px] font-bold text-amber">
              {t('game.noRom')}
            </div>
          )}
        </div>

        {/* 底部整块留白 = 毛玻璃板：标题在正中，类型标签压在这块板的右下角 */}
        <div className="card-body card-body--game">
          <h3 className="card-title card-title--game block w-full truncate text-center text-white transition-colors group-hover:text-neon">
            {game.title}
          </h3>
          {genres.length > 0 && (
            <span className="genre-badge" title={game.genre}>
              {genres[0]}
            </span>
          )}
        </div>
      </PixelCard>
    </Link>
  );
}
