import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAsset } from '../assets';
import { useI18n } from '../i18n';
import type { Game } from '../types';
import { IconChevronLeft, IconChevronRight, IconGamepad, IconSearch, IconX } from './Icons';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-muted">
      <div className="flex items-end gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="block w-2.5 bg-neon"
            style={{
              height: `${10 + i * 6}px`,
              animation: `floaty .9s ease-in-out ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </div>
      <p className="text-xs tracking-[0.3em] text-muted">{label ?? t('state.loading')}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-line/80 bg-panel/60 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center border-2 border-line bg-panel text-neon">
        {icon || <IconGamepad className="h-7 w-7" />}
      </div>
      <h3 className="text-base font-bold text-white">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        className={`relative my-auto w-full ${width} border-2 border-line bg-surface shadow-[8px_8px_0_0_rgba(0,0,0,.7)] animate-popin`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b-2 border-line bg-panel px-4 py-3">
          <h3 className="font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center border border-line text-muted transition-colors hover:border-neon hover:text-neon"
            aria-label={t('action.close')}
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-line bg-panel px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="max-w-md"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t('action.cancel')}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {confirmText ?? t('action.delete')}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted">{message}</p>
    </Modal>
  );
}

export function PlatformBadge({
  name,
  color,
  className = '',
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-black tracking-wider ${className}`}
      style={{ color, borderColor: `${color}66`, background: `${color}18` }}
    >
      {name}
    </span>
  );
}

/**
 * 封面组件：没有封面时优先用后台设置的占位图，其次用平台配色生成像素占位图。
 *
 * frameRatio 是外层牌面的宽高比（游戏卡 400:567）。封面比例跟牌面差得多时，
 * 铺满裁切会把卡盒边缘和标题切掉（GBA/NDS 的方图要裁 30%，N64 的横图要裁 50%），
 * 这时改成完整显示，空出来的地方垫一层同图放大虚化的底：
 * 网格还是整齐的，图也不残缺。差 15% 以内照旧铺满裁切，FC/SFC/MD/街机等于零变化。
 */
export function GameCover({
  game,
  className = '',
  frameRatio = 400 / 567,
}: {
  game: Game;
  className?: string;
  frameRatio?: number;
}) {
  const [broken, setBroken] = useState(false);
  const [fit, setFit] = useState(false);
  const placeholder = useAsset('game_placeholder');
  const color = game.platformColor || '#4cc9ff';

  useEffect(() => {
    setBroken(false);
    setFit(false);
  }, [game.cover]);

  // 图片自身宽高比与牌面差超过 15% 就改完整显示，不写死平台表：
  // 换一套封面包、或某平台混进比例不对的图，也能自己兜住。
  function handleLoad(e: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    const ratio = naturalWidth / naturalHeight;
    setFit(Math.abs(ratio - frameRatio) / frameRatio > 0.15);
  }

  if (!game.cover && placeholder) {
    return (
      <img
        src={placeholder}
        alt={game.title}
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  if (game.cover && !broken) {
    if (fit) {
      return (
        <div className="relative h-full w-full overflow-hidden">
          <img src={game.cover} alt="" aria-hidden="true" loading="lazy" className="cover-echo" />
          <img
            src={game.cover}
            alt={game.title}
            loading="lazy"
            onLoad={handleLoad}
            onError={() => setBroken(true)}
            className={`cover-fit relative h-full w-full object-contain ${className}`}
          />
        </div>
      );
    }

    return (
      <img
        src={game.cover}
        alt={game.title}
        loading="lazy"
        onLoad={handleLoad}
        onError={() => setBroken(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  const initial = game.title.trim().charAt(0) || '?';
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(circle at 50% 30%, ${color}33, #04101f 70%)` }}
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />
      <span
        className="relative font-pixel text-5xl leading-none sm:text-6xl"
        style={{ color, textShadow: '4px 4px 0 rgba(0,0,0,.55), 0 0 40px currentColor' }}
      >
        {initial}
      </span>
      <span className="relative mt-4 text-[10px] font-bold tracking-[0.35em] text-white/55">
        {game.platformShort}
      </span>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let i = start; i < start + 5 && i <= totalPages; i += 1) pages.push(i);

  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      <button
        className="flex h-9 w-9 items-center justify-center border-2 border-line bg-panel text-muted transition-colors hover:border-neon hover:text-neon disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('page.prev')}
      >
        <IconChevronLeft className="h-4 w-4" />
      </button>
      {start > 1 && <span className="px-1 text-muted">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`h-9 min-w-9 border-2 px-2 text-sm font-bold transition-colors ${
            p === page
              ? 'border-neon bg-neon/15 text-neon'
              : 'border-line bg-panel text-muted hover:border-white/40 hover:text-white'
          }`}
        >
          {p}
        </button>
      ))}
      {start + 4 < totalPages && <span className="px-1 text-muted">…</span>}
      <button
        className="flex h-9 w-9 items-center justify-center border-2 border-line bg-panel text-muted transition-colors hover:border-neon hover:text-neon disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={t('page.next')}
      >
        <IconChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-2 border-line/70 bg-panel/60">
          <div className="skeleton aspect-[3/4] w-full" />
          <div className="space-y-2 p-2.5">
            <div className="skeleton h-3 w-4/5" />
            <div className="skeleton h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchEmpty({ keyword }: { keyword: string }) {
  const { t, tx } = useI18n();
  return (
    <EmptyState
      icon={<IconSearch className="h-7 w-7" />}
      title={`${tx('empty.search.title')}${keyword ? ` · ${keyword}` : ''}`}
      description={t('library.emptyDesc')}
    />
  );
}
