import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsset } from '../assets';
import { GameCard } from '../components/GameCard';
import { PlatformCard } from '../components/PlatformCard';
import { SeriesCard } from '../components/SeriesCard';
import { EmptyState, PageLoader } from '../components/ui';
import { useI18n } from '../i18n';
import type { HomeData } from '../types';

export default function Home() {
  const { t, tx } = useI18n();
  const banner = useAsset('hero_banner');
  const [data, setData] = useState<HomeData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    api
      .get<HomeData>('/home')
      .then((res) => {
        if (!alive) return;
        setData(res);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, []);

  const platformRef = useRef<HTMLElement>(null);
  const featuredRef = useRef<HTMLElement>(null);

  /**
   * 首屏「露出多少」：量出平台区顶到卡片图片下沿的距离（= 抬头 + 方图高），
   * Hero 高度减去这段，首屏底边就正好切在图片下沿 —— 只看到图，文字区在折叠线以下。
   * 卡片宽度随窗口变化，所以用 ResizeObserver 跟着重量。
   */
  const [peek, setPeek] = useState<number | null>(null);
  useLayoutEffect(() => {
    const sec = platformRef.current;
    if (!sec) return;
    const measure = () => {
      const art = sec.querySelector<HTMLElement>('.card-art--platform');
      if (!art) return;
      const px = Math.round(art.getBoundingClientRect().bottom - sec.getBoundingClientRect().top + 2);
      setPeek(Math.min(460, Math.max(160, px)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [data]);

  /**
   * 分段式滚动：滚一次鼠标 = 翻一屏。
   * 只在大屏且停在锚点上时接管，其余情况保持自然滚动，避免把页脚卡住。
   */
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    const HEADER = 64;
    let lockUntil = 0;

    const anchorOf = (el: HTMLElement | null) =>
      el ? Math.round(el.getBoundingClientRect().top + window.scrollY - HEADER) : Infinity;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.deltaY === 0) return;
      if (Date.now() < lockUntil) {
        e.preventDefault();
        return;
      }
      const anchors = [0, anchorOf(platformRef.current), anchorOf(featuredRef.current)];
      const y = window.scrollY;
      const index = anchors.findIndex((a) => Number.isFinite(a) && Math.abs(a - y) < 48);
      if (index === -1) return;

      const next = e.deltaY > 0 ? index + 1 : index - 1;
      if (next < 0 || next >= anchors.length) return;
      const target = anchors[next];
      if (!Number.isFinite(target)) return;

      e.preventDefault();
      lockUntil = Date.now() + 700;
      window.scrollTo({ top: target, behavior: 'smooth' });
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // 精选区：只展示真正设为精选的游戏 + 系列，没有任何精选内容时整个区块隐藏
  const featuredGames = useMemo(() => data?.featuredGames || [], [data]);
  const featuredSeries = useMemo(() => data?.featuredSeries || [], [data]);
  const hasFeatured = featuredGames.length > 0 || featuredSeries.length > 0;

  if (status === 'loading') return <PageLoader label={t('state.loading')} />;

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-shell px-5 py-20">
        <EmptyState title={t('state.error')} description={t('library.emptyDesc')} />
      </div>
    );
  }

  const platforms = data?.platforms || [];
  const total = data?.total || 0;

  return (
    <div className="fade-up">
      {/* ================= 上半区：一张图贯穿 Banner 与平台区，中间不切 ================= */}
      <div className="relative">
        {/*
          背景层：图片按原始宽高比铺满整宽（不裁切），高度自然延伸到平台卡片后面，
          再用渐变淡出到页面底色，所以整张图不会在分区处被生生切开。
        */}
        <div aria-hidden className="hero-fade pointer-events-none absolute inset-x-0 top-0 overflow-hidden">
          {banner ? (
            <>
              {/* 同一张图放大模糊铺满整屏，补住原图比例之外的区域，避免下方出现大片死黑 */}
              <img src={banner} alt="" aria-hidden className="hero-bg-blur" />
              <img src={banner} alt="" className="hero-bg-img pixel-img" />
              {/* 只做轻微压暗，淡出交给图片自身的 mask，避免出现一条硬边 */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to bottom, rgba(5,10,31,.12) 0%, rgba(5,10,31,.18) 42%, rgba(5,10,31,.40) 60%, rgba(5,10,31,.48) 72%, rgba(5,10,31,0) 92%)',
                }}
              />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_16%,rgba(76,201,255,.24),transparent_60%)]" />
              <div
                className="absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, #4cc9ff 1px, transparent 1px), linear-gradient(to bottom, #4cc9ff 1px, transparent 1px)',
                  backgroundSize: '44px 44px',
                  maskImage: 'radial-gradient(ellipse at 50% 22%, black, transparent 72%)',
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to bottom, transparent 0%, transparent 42%, #050a1f 78%, #050a1f 100%)',
                }}
              />
            </>
          )}
        </div>

        {/* ---------------- Banner 文案（透明底，直接压在同一张图上） ---------------- */}
        <section
          className="hero-screen on-art relative flex w-full items-center justify-center px-5"
          style={peek ? ({ '--plat-peek': `${peek}px` } as CSSProperties) : undefined}
        >
          <div className="hero-copy flex w-full max-w-shell flex-col items-center text-center">
            <span className="mb-4 inline-flex items-center gap-2 border border-white/25 bg-black/35 px-3 py-1.5 text-[12px] tracking-[0.24em] text-neon backdrop-blur-[1px]">
              {tx('hero.badge')}
            </span>

            <h1
              className="font-pixel text-[27px] leading-[1.7] tracking-[2px] text-white sm:text-[44px] sm:tracking-[4px]"
              style={{ textShadow: '0 0 18px rgba(76,201,255,.65), 0 3px 0 rgba(0,0,0,.6)' }}
            >
              {tx('hero.title') || 'ABXY ARCADE'}
            </h1>

            <p
              className="mt-4 max-w-lg text-[17px] leading-[1.9] text-white/85 sm:text-[19px]"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,.85)' }}
            >
              {tx('hero.subtitle')}
            </p>

            <p className="mt-6 text-[13px] tracking-[0.14em] text-white/45">{tx('hero.meta')}</p>
          </div>

          <div className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex">
            <span className="h-7 w-[2px] bg-gradient-to-b from-transparent via-neon/60 to-neon/10" />
            <span className="h-1.5 w-1.5 bg-neon blink" />
          </div>
        </section>

        {/* ---------------- 平台分区：直接叠在图片下半部分，不画分割线 ---------------- */}
        <section
          ref={platformRef}
          className="relative mx-auto flex w-full max-w-[1520px] flex-col justify-start px-4 pb-10 pt-8 sm:px-5"
        >
          {/* on-art 只套在这块抬头文字上（压在背景图上）；不能套到外层 section，
              否则白天会把下面卡片墙里本应深色的标题/简介一起强制成白色 */}
          <div
            className="on-art mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5"
            style={{ textShadow: '0 2px 10px rgba(5,10,31,.95), 0 1px 2px rgba(5,10,31,.9)' }}
          >
            <h2 className="section-title section-title--lg">{tx('home.platforms.title')}</h2>
            <span className="text-[14px] text-white/70">{tx('home.platforms.desc')}</span>
            <span className="ml-auto text-[13px] text-white/55">
              {t('library.count', { n: total })}
            </span>
          </div>

          <div className="platform-grid mx-auto">
            {platforms.map((p) => (
              <PlatformCard key={p.id} platform={p} />
            ))}
          </div>
        </section>
      </div>

      {/* ---------------- 精选 ---------------- */}
      {hasFeatured && (
        <section ref={featuredRef} className="mx-auto max-w-shell px-4 pb-16 sm:px-5">
          <div className="section-head">
            <h2 className="section-title section-title--xl">{tx('home.featured.title')}</h2>
            <span className="text-[13px] text-muted">{tx('home.featured.desc')}</span>
            <Link
              to="/library"
              className="ml-auto whitespace-nowrap text-[13px] font-bold text-neon hover:underline"
            >
              {tx('home.viewAll')} ›
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {featuredSeries.map((s, i) => (
              <SeriesCard key={`fs-${s.id}`} series={s} index={i} />
            ))}
            {featuredGames.map((game, i) => (
              <GameCard key={game.id} game={game} index={featuredSeries.length + i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
