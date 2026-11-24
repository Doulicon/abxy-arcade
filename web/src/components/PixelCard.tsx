import type { ReactNode } from 'react';

/**
 * 统一像素卡片：外层 3px 像素边框 + 阶梯切角，内层是内容底色。
 * 悬停时边框变霓虹色并轻微上浮，游戏卡与平台卡共用同一套规范。
 *
 * bgSrc：整卡铺一层「封面自身的模糊放大版」作底。封面无论 1:1、横图还是竖版，
 * 露出来的留白和下方文字区都是同一张图的磨砂质感，不会出现黑块/白块。
 */
export function PixelCard({
  children,
  className = '',
  innerClassName = '',
  hover = true,
  amber = false,
  bgSrc,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  hover?: boolean;
  amber?: boolean;
  bgSrc?: string;
}) {
  return (
    <div
      className={`px-card px-card-shape h-full ${hover ? 'px-card-hover' : ''} ${
        amber ? 'px-card-amber' : ''
      } ${className}`}
    >
      <div className={`px-card-in ${innerClassName}`}>
        {bgSrc ? (
          <img src={bgSrc} alt="" aria-hidden="true" loading="lazy" className="card-cover-bg" />
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** 年份标签：橙色像素小方框 */
export function YearChip({ children }: { children: ReactNode }) {
  return <span className="year-chip font-pixel">{children}</span>;
}
