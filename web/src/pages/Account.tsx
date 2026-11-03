import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { PageLoader } from '../components/ui';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatDate } from '../utils';

/** 个人信息：账号概览 + 改密码（所有角色都可用） */
export default function Account() {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const toast = useToast();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader label="CHECKING" />;
  if (!user) return <Navigate to="/login?redirect=%2Faccount" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!oldPassword) return setError(t('account.err.oldRequired'));
    if (newPassword.length < 6 || newPassword.length > 72) return setError(t('account.err.length'));
    if (newPassword !== confirmPassword) return setError(t('account.err.mismatch'));
    if (newPassword === oldPassword) return setError(t('account.err.same'));

    setBusy(true);
    try {
      await api.post('/auth/password', { oldPassword, newPassword });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast(t('account.success'), 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('account.err.fail');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-5 sm:py-14">
      <h1 className="font-pixel text-[15px] leading-[1.6] text-neon sm:text-[18px]">
        {t('account.title')}
      </h1>
      <p className="mt-2 text-[12px] text-white/60">{t('account.subtitle')}</p>

      {/* 账号信息 */}
      <section className="mt-6 border-2 border-line bg-panel">
        <div className="border-b-2 border-line px-4 py-2.5">
          <h2 className="text-[12px] font-black tracking-wide text-white">
            {t('account.profile')}
          </h2>
        </div>
        <dl className="divide-y divide-line/60">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-[11px] font-bold text-muted">{t('account.username')}</dt>
            <dd className="flex items-center gap-2 text-[13px] font-bold text-white">
              <span className="flex h-6 w-6 items-center justify-center bg-neon/20 text-[11px] font-black text-neon">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
              {user.username}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-[11px] font-bold text-muted">{t('account.role')}</dt>
            <dd>
              <span
                className={`inline-block border px-1.5 py-0.5 text-[10px] font-bold ${
                  user.role === 'admin'
                    ? 'border-[#ffd166]/50 bg-[#ffd166]/10 text-[#ffd166]'
                    : 'border-line bg-white/[0.04] text-white/70'
                }`}
              >
                {user.role === 'admin' ? t('nav.roleAdmin') : t('nav.roleUser')}
              </span>
            </dd>
          </div>
          {user.createdAt && (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[11px] font-bold text-muted">{t('account.createdAt')}</dt>
              <dd className="text-[12px] text-white/75">{formatDate(user.createdAt)}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* 修改密码 */}
      <section className="mt-5 border-2 border-line bg-panel">
        <div className="border-b-2 border-line px-4 py-2.5">
          <h2 className="text-[12px] font-black tracking-wide text-white">
            {t('account.passwordTitle')}
          </h2>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">{t('account.passwordHint')}</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 px-4 py-4">
          <div>
            <label className="label" htmlFor="acc-old">
              {t('account.oldPassword')}
            </label>
            <input
              id="acc-old"
              type="password"
              className="field"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="acc-new">
                {t('account.newPassword')}
              </label>
              <input
                id="acc-new"
                type="password"
                className="field"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••"
              />
            </div>
            <div>
              <label className="label" htmlFor="acc-confirm">
                {t('account.confirmPassword')}
              </label>
              <input
                id="acc-confirm"
                type="password"
                className="field"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••"
              />
            </div>
          </div>

          {error && (
            <p className="border-l-2 border-[#ff5b7f] bg-[#ff5b7f]/10 px-2.5 py-1.5 text-[11px] text-[#ff8fa8]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary text-[12px]" disabled={busy}>
              {busy ? t('account.saving') : t('account.submit')}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-[11px]"
              onClick={async () => {
                await logout();
              }}
            >
              {t('nav.logout')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
