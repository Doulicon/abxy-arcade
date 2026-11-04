import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAsset } from '../assets';
import { useAuth } from '../auth';
import { useI18n, type LocaleId } from '../i18n';
import { useTheme } from '../theme';
import { useToast } from './Toast';
import {
  IconCheck,
  IconChevronDown,
  IconDisc,
  IconGamepad,
  IconGlobe,
  IconGrid,
  IconHeart,
  IconLogout,
  IconMenu,
  IconSearch,
  IconSparkle,
  IconSun,
  IconMoon,
  IconUser,
  IconX,
  IconGift,
} from './Icons';

function Logo() {
  const logo = useAsset('site_logo');
  const { tx } = useI18n();
  return (
    <Link to="/" className="group flex shrink-0 items-center gap-2.5">
      {logo ? (
        <img
          src={logo}
          alt={tx('brand.name') || 'logo'}
          className="pixel-img h-9 w-auto max-w-[160px] object-contain"
        />
      ) : (
        <>
          {/* 站点标识：GBA 素材包图标（透明底，深色导航栏直接压上去即可） */}
          <img
            src="/brand/logo-mark.png"
            alt={tx('brand.name') || 'ABXY ARCADE'}
            className="pixel-img h-9 w-auto shrink-0 object-contain"
          />
          <span className="hidden flex-col leading-none sm:flex">
            <span className="font-pixel text-[11px] tracking-tight text-white">
              {tx('brand.name') || 'ABXY ARCADE'}
            </span>
            <span className="mt-1.5 font-pixel text-[7px] tracking-[0.3em] text-neon">
              {tx('brand.sub') || 'ARCADE'}
            </span>
          </span>
        </>
      )}
    </Link>
  );
}

function SearchBox({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [value, setValue] = useState(new URLSearchParams(location.search).get('q') || '');

  useEffect(() => {
    setValue(new URLSearchParams(location.search).get('q') || '');
  }, [location.search]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    navigate(q ? `/library?q=${encodeURIComponent(q)}` : '/library');
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="relative w-full">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('search.placeholder')}
        className="search-field"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            navigate('/library');
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-white"
          aria-label={t('search.clear')}
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button
      onClick={toggleTheme}
      aria-label={t('nav.theme')}
      title={t('nav.theme')}
      className="px-btn-shape flex h-9 w-9 items-center justify-center border-2 border-line bg-panel text-white transition-colors hover:border-neon hover:text-neon"
    >
      {theme === 'night' ? <IconMoon className="h-4 w-4" /> : <IconSun className="h-4 w-4" />}
    </button>
  );
}

/**
 * 捐赠按钮：悬停弹出收款码。
 * 收款码图片由站点管理员手动放置到 web/public/qr/donate.png（无需改代码）。
 * 图片自适应大小与比例，缺失时显示占位提示。
 */
function DonateButton() {
  const { t } = useI18n();
  return (
    <div className="group relative">
      <button
        aria-label={t('nav.donate')}
        title={t('nav.donate')}
        className="px-btn-shape flex h-9 items-center gap-1.5 border-2 border-line bg-panel px-2 text-[11px] font-bold text-white transition-colors hover:border-[#ffd166] hover:text-[#ffd166]"
      >
        <IconGift className="h-4 w-4" />
        <span className="hidden xl:inline">{t('nav.donate')}</span>
      </button>

      {/* 悬停弹层：收款码 */}
      <div className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-50 w-56 scale-95 border-2 border-line bg-surface p-3 opacity-0 shadow-[5px_5px_0_0_rgba(0,0,0,.7)] transition-all duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
        <p className="mb-2 text-center text-[11px] font-bold text-white">{t('donate.title')}</p>
        <img
          src="/qr/donate.png"
          alt={t('donate.title')}
          className="mx-auto h-auto max-h-52 w-auto max-w-full object-contain"
          loading="lazy"
          onError={(e) => {
            // 图片缺失时显示占位提示，避免破图
            const el = e.currentTarget;
            el.style.display = 'none';
            const sib = el.nextElementSibling as HTMLElement | null;
            if (sib) sib.style.display = 'block';
          }}
        />
        <p
          className="hidden py-4 text-center text-[10px] leading-relaxed text-muted"
          aria-hidden="true"
        >
          {t('donate.tip')}
        </p>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">{t('donate.desc')}</p>
      </div>
    </div>
  );
}

function LanguageMenu() {
  const { locale, setLocale, locales, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = locales.find((l) => l.id === locale) || locales[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('nav.language')}
        className="px-btn-shape flex h-9 items-center gap-1.5 border-2 border-line bg-panel px-2 text-[11px] font-bold text-white transition-colors hover:border-neon hover:text-neon"
      >
        <IconGlobe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{current.short}</span>
        <IconChevronDown className="h-3 w-3 text-muted" />
      </button>

      {open && (
        <div className="px-card-shape absolute right-0 top-[calc(100%+6px)] z-50 w-44 border-2 border-line bg-surface p-1 shadow-[5px_5px_0_0_rgba(0,0,0,.7)]">
          {locales.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setLocale(l.id as LocaleId);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[12px] transition-colors ${
                l.id === locale ? 'bg-neon/10 text-neon' : 'text-white/80 hover:bg-white/5'
              }`}
            >
              <span>{l.label}</span>
              {l.id === locale && <IconCheck className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!user) {
    return (
      <Link to="/login" className="btn btn-primary h-9 px-3 py-0 text-[11px]">
        {t('nav.login')}
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-btn-shape flex h-9 items-center gap-2 border-2 border-line bg-panel px-2 pr-2.5 text-[12px] font-bold text-white transition-colors hover:border-neon"
      >
        <span className="flex h-5 w-5 items-center justify-center bg-neon/20 text-[11px] font-black text-neon">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[90px] truncate sm:block">{user.username}</span>
        <IconMenu className="h-3.5 w-3.5 text-muted" />
      </button>

      {open && (
        <div className="px-card-shape absolute right-0 top-[calc(100%+6px)] z-50 w-48 border-2 border-line bg-surface shadow-[5px_5px_0_0_rgba(0,0,0,.7)] animate-popin">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-[13px] font-bold text-white">{user.username}</p>
            <p className="mt-0.5 text-[10px] text-muted">
              {user.role === 'admin' ? t('nav.roleAdmin') : t('nav.roleUser')}
            </p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate('/account');
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-white/85 hover:bg-white/5 hover:text-neon"
          >
            <IconUser className="h-4 w-4" /> {t('nav.account')}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate('/favorites');
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-white/85 hover:bg-white/5 hover:text-neon"
          >
            <IconHeart className="h-4 w-4" /> {t('nav.favorites')}
          </button>
          {user.role === 'admin' && (
            <button
              onClick={() => {
                setOpen(false);
                navigate('/admin');
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-white/85 hover:bg-white/5 hover:text-neon"
            >
              <IconSparkle className="h-4 w-4" /> {t('nav.admin')}
            </button>
          )}
          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              toast(t('nav.logout'), 'info');
              navigate('/');
            }}
            className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[12px] text-muted hover:bg-white/5 hover:text-[#ff8fa8]"
          >
            <IconLogout className="h-4 w-4" /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 底部二维码位：自适应图片大小与比例，缺失时显示占位框。
 */
function FooterQr({ label, src }: { label: string; src: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-20 w-20 overflow-hidden border border-line bg-white/5">
        <img
          src={src}
          alt={label}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = 'none';
            const sib = el.nextElementSibling as HTMLElement | null;
            if (sib) sib.style.display = 'flex';
          }}
        />
        <div
          className="hidden h-full w-full flex-col items-center justify-center text-center text-[9px] leading-snug text-muted"
          aria-hidden="true"
        >
          {label}
        </div>
      </div>
      <span className="text-center text-[9px] text-white/50">{label}</span>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const { t, tx } = useI18n();
  const location = useLocation();
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  const NAV = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/library', label: t('nav.library') },
    { to: '/platforms', label: t('nav.platforms') },
    { to: '/favorites', label: t('nav.favorites') },
  ];

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex h-16 items-center whitespace-nowrap px-1 text-[13px] font-bold transition-colors lg:px-1.5 lg:text-[14px] ${
      isActive ? 'text-neon' : 'text-white/60 hover:text-white'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b-2 border-line bg-ink/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-shell items-center gap-2.5 px-4 sm:gap-5 sm:px-5">
          <Logo />

          <nav className="hidden items-center gap-4 md:flex lg:gap-7">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && (
                      <span className="absolute inset-x-0 -bottom-[2px] h-[2px] bg-neon shadow-glow-sm" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
            {user?.role === 'admin' && (
              <NavLink to="/admin" className={navLinkClass}>
                {({ isActive }) => (
                  <>
                    {t('nav.admin')}
                    {isActive && (
                      <span className="absolute inset-x-0 -bottom-[2px] h-[2px] bg-neon shadow-glow-sm" />
                    )}
                  </>
                )}
              </NavLink>
            )}
            <NavLink to="/about" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  {t('nav.about')}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[2px] h-[2px] bg-neon shadow-glow-sm" />
                  )}
                </>
              )}
            </NavLink>
          </nav>

          <div className="ml-auto hidden w-full max-w-[220px] lg:block">
            <SearchBox />
          </div>

          <button
            onClick={() => setMobileSearch((v) => !v)}
            className="px-btn-shape ml-auto flex h-9 w-9 shrink-0 items-center justify-center border-2 border-line text-muted lg:hidden"
            aria-label={t('search.placeholder')}
          >
            {mobileSearch ? <IconX className="h-4 w-4" /> : <IconSearch className="h-4 w-4" />}
          </button>

          <div className="flex shrink-0 items-center gap-1.5 md:ml-0">
            <DonateButton />
            <LanguageMenu />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        {mobileSearch && (
          <div className="border-t border-line px-3 py-2 lg:hidden">
            <SearchBox onDone={() => setMobileSearch(false)} />
          </div>
        )}
      </header>

      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>

      <footer className="border-t-2 border-line bg-[#06102a]">
        <div className="mx-auto grid w-full max-w-shell gap-8 px-5 py-10 lg:grid-cols-[1fr_auto]">
          {/* 左侧：说明文字，整体左移 */}
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="font-pixel text-[12px] text-white">{tx('brand.name')}</p>
              <p className="mt-3 max-w-md text-[11px] leading-[1.9] text-muted">
                {tx('footer.about')}
              </p>
            </div>
            <div>
              <p className="mb-3 font-pixel text-[9px] text-neon">{tx('footer.note')}</p>
              <p className="text-[11px] leading-[1.9] text-muted">{tx('footer.disclaimer')}</p>
            </div>
          </div>

          {/* 右侧：联系二维码 / 收款码（图片由管理员手动放置到 web/public/qr/） */}
          <div className="flex flex-col items-center gap-2 lg:items-end">
            <p className="font-pixel text-[9px] tracking-wide text-neon">{t('footer.contactTitle')}</p>
            <div className="flex items-start gap-3">
              <FooterQr label={t('footer.qr.wechat')} src="/qr/contact-wechat.png" />
              <FooterQr label={t('footer.qr.alipay')} src="/qr/contact-alipay.png" />
              <FooterQr label={t('footer.qr.donate')} src="/qr/donate.png" />
            </div>
          </div>
        </div>
        <div className="border-t border-line/60 px-5 py-4">
          <p className="mx-auto max-w-shell text-center text-[10px] text-muted/70">
            {tx('footer.copyright').replace('{year}', String(new Date().getFullYear()))}
          </p>
        </div>
      </footer>

      {/* 移动端底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t-2 border-line bg-ink/95 backdrop-blur-md md:hidden">
        {[
          { to: '/', label: t('nav.home'), icon: <IconGamepad className="h-5 w-5" /> },
          { to: '/library', label: t('nav.library'), icon: <IconGrid className="h-5 w-5" /> },
          { to: '/platforms', label: t('nav.platforms'), icon: <IconDisc className="h-5 w-5" /> },
          { to: '/favorites', label: t('nav.favorites'), icon: <IconHeart className="h-5 w-5" /> },
          {
            to: user?.role === 'admin' ? '/admin' : '/login',
            label: user?.role === 'admin' ? t('nav.admin') : t('nav.account'),
            icon: user ? <IconSparkle className="h-5 w-5" /> : <IconUser className="h-5 w-5" />,
          },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[9px] font-bold transition-colors ${
                isActive ? 'text-neon' : 'text-white/50'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
