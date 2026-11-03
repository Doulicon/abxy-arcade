import type { ReactNode } from 'react';

/**
 * 统一像素卡片：外层 3px 像素边框 + 阶梯切角，内层是内容底色。
 * 悬停时边框变霓虹色并轻微上浮，游戏卡与平台卡共用同一套规范。
 */
export function PixelCard({
  children,
  className = '',
  innerClassName = '',
  hover = true,
  amber = false,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  hover?: boolean;
  amber?: boolean;
}) {
  return (
    <div
      className={`px-card px-card-shape h-full ${hover ? 'px-card-hover' : ''} ${
        amber ? 'px-card-amber' : ''
      } ${className}`}
    >
      <div className={`px-card-in ${innerClassName}`}>{children}</div>
    </div>
  );
}

/** 年份标签：橙色像素小方框 */
export function YearChip({ children }: { children: ReactNode }) {
  return <span className="year-chip font-pixel">{children}</span>;
}
