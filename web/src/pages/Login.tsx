import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { IconGamepad, IconLock, IconUser } from '../components/Icons';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';

export default function Login({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [allowRegister, setAllowRegister] = useState(true);

  useEffect(() => {
    api
      .get<{ allowRegister: boolean }>('/config')
      .then((c) => setAllowRegister(c.allowRegister))
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError(t('auth.errEmpty'));
      return;
    }
    if (isRegister && password !== confirm) {
      setError(t('auth.errMismatch'));
      return;
    }

    setBusy(true);
    try {
      if (isRegister) {
        await register(username.trim(), password);
        toast(t('auth.registerOk'), 'success');
      } else {
        await login(username.trim(), password);
        toast(t('auth.loginOk'), 'success');
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-56px)] items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(circle at 50% 40%, black, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[880px] border-2 border-line bg-surface/95 shadow-[10px_10px_0_0_rgba(0,0,0,.6)] backdrop-blur animate-popin md:grid md:grid-cols-[1fr_1.05fr]">
        {/* 左侧装饰 */}
        <div className="relative hidden flex-col justify-between overflow-hidden border-r-2 border-line bg-[#0d0d15] p-8 md:flex">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              background:
                'radial-gradient(circle at 30% 20%, rgba(251,114,153,.22), transparent 60%), radial-gradient(circle at 80% 90%, rgba(34,211,238,.14), transparent 55%)',
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center bg-neon text-[#1a0710]">
                <IconGamepad className="h-5 w-5" />
              </span>
              <div>
                <p className="font-pixel text-[11px] text-white">ABXY</p>
                <p className="text-[9px] font-bold tracking-[0.4em] text-neon">ARCADE</p>
              </div>
            </div>

            <h2 className="mt-10 text-2xl font-black leading-relaxed text-white">
              按下 START，
              <br />
              回到那个
              <span className="text-neon">像素闪烁</span>
              的夏天。
            </h2>
            <p className="mt-4 text-xs leading-relaxed text-white/45">
              收藏你爱的老游戏，插上手柄，
              <br />
              在浏览器里直接开玩。
            </p>
          </div>

          <div className="relative mt-10">
            <div className="flex gap-1">
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className="h-6 flex-1"
                  style={{
                    background: i % 4 === 0 ? '#4cc9ff' : i % 3 === 0 ? '#22d3ee' : '#1e1e2b',
                    opacity: i % 4 === 0 ? 1 : 0.7,
                  }}
                />
              ))}
            </div>
            <p className="mt-3 text-[10px] tracking-[0.3em] text-white/25">INSERT COIN · 1980 - NOW</p>
          </div>
        </div>

        {/* 表单 */}
        <div className="p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-black text-white sm:text-2xl">
              {isRegister ? t('auth.registerTitle') : t('auth.welcome')}
            </h1>
            <p className="mt-1.5 text-xs text-muted">
              {isRegister ? t('auth.registerHint') : t('auth.loginHint')}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="username">
                {t('auth.username')}
              </label>
              <div className="relative">
                <IconUser className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="username"
                  className="field pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth.userHint')}
                  autoComplete="username"
                  maxLength={20}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">
                {t('auth.password')}
              </label>
              <div className="relative">
                <IconLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  type="password"
                  className="field pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passHint')}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="label" htmlFor="confirm">
                  {t('auth.confirmPassword')}
                </label>
                <div className="relative">
                  <IconLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="confirm"
                    type="password"
                    className="field pl-9"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={t('auth.confirmPassword')}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 border-2 border-[#7f2038] bg-[#3a1020]/70 px-3 py-2.5 text-xs leading-relaxed text-[#ff8fa8]">
                <span className="mt-0.5 font-black">!</span>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full py-3 text-sm" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <IconGamepad className="h-4 w-4" />}
              {isRegister ? t('auth.registerSubmit') : t('auth.login')}
            </button>
          </form>

          <div className="mt-5 border-t border-line pt-4 text-center text-xs text-muted">
            {isRegister ? (
              <>
                {t('auth.switchToLogin')}
                <Link
                  to={`/login${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
                  className="ml-1 font-bold text-neon hover:underline"
                >
                  {t('auth.login')}
                </Link>
              </>
            ) : allowRegister ? (
              <>
                {t('auth.switchToRegister')}
                <Link
                  to={`/register${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
                  className="ml-1 font-bold text-neon hover:underline"
                >
                  {t('auth.freeRegister')}
                </Link>
              </>
            ) : (
              <span className="text-white/30">{t('auth.closed')}</span>
            )}
          </div>

          {!isRegister && (
            <p className="mt-4 text-center text-[10px] leading-relaxed text-white/25">
              {t('auth.deployHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
