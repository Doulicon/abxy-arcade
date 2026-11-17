import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import {
  IconCheck,
  IconDisc,
  IconEdit,
  IconGamepad,
  IconHeart,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
  IconUsers,
} from '../components/Icons';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import {
  ConfirmDialog,
  EmptyState,
  GameCover,
  Modal,
  PageLoader,
  Pagination,
  PlatformBadge,
  Spinner,
} from '../components/ui';
import type { AdminStats, AdminUser, Game, Paged, Platform, Series } from '../types';
import { formatBytes, formatCount, formatDate } from '../utils';
import AdminAssets from './AdminAssets';
import AdminTexts from './AdminTexts';
import AdminGameForm from './AdminGameForm';
import AdminSeries from './AdminSeries';

type Tab = 'games' | 'platforms' | 'series' | 'users' | 'bios' | 'assets' | 'texts';

type BiosItem = { name: string; size: number; uploadedAt: string; usedBy: number };

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden border-2 border-line bg-panel px-3 py-3.5">
      <div className="absolute right-0 top-0 h-full w-1" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wide text-muted">{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <p className="mt-1.5 font-pixel text-lg text-white">{value}</p>
    </div>
  );
}

/** 表头全选复选框：部分选中时显示半选态 */
function SelectAllBox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      title={label}
      aria-label={label}
      className="h-3.5 w-3.5 cursor-pointer accent-[#4cc9ff]"
    />
  );
}

/** 行内权重输入：失焦或回车即保存，数字越大越靠前 */
function WeightInput({ game, onSaved }: { game: Game; onSaved: (id: number, weight: number) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [value, setValue] = useState(String(game.weight ?? 0));
  const [saving, setSaving] = useState(false);
  const current = game.weight ?? 0;

  useEffect(() => {
    setValue(String(current));
  }, [current]);

  const save = async () => {
    const n = Number(value.trim() === '' ? 0 : value);
    if (!Number.isInteger(n) || Math.abs(n) > 9999) {
      setValue(String(current));
      toast(t('admin.weight.invalid'), 'error');
      return;
    }
    if (n === current) return;
    setSaving(true);
    try {
      await api.patch(`/admin/games/${game.id}/weight`, { weight: n });
      onSaved(game.id, n);
      toast(t('admin.weight.saved', { title: game.title, n }), 'success');
    } catch (e) {
      setValue(String(current));
      toast(e instanceof ApiError ? e.message : t('admin.weight.saveFail'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="number"
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      title={t('admin.weight.hint')}
      className={`h-7 w-14 border text-center text-[11px] font-bold outline-none transition-colors ${
        saving
          ? 'border-neon/60 bg-neon/10 text-neon'
          : current > 0
            ? 'border-[#3ddc84]/50 bg-[#3ddc84]/10 text-[#3ddc84]'
            : 'border-line bg-transparent text-white/70'
      } focus:border-neon`}
      aria-label={t('admin.weight.label')}
    />
  );
}

/** 平台排序权重面板：数字越大，首页 / 游戏平台页里越靠前 */
function PlatformWeights({
  platforms,
  onSaved,
}: {
  platforms: Platform[];
  onSaved: (id: string, weight: number) => void;
}) {
  const { t, tx } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(Object.fromEntries(platforms.map((p) => [p.id, String(p.weight ?? 0)])));
  }, [platforms]);

  if (!platforms.length) return null;

  const changed = platforms.filter((p) => Number(draft[p.id] ?? 0) !== (p.weight ?? 0));

  const save = async () => {
    if (!changed.length) return;
    const weights: Record<string, number> = {};
    for (const p of changed) {
      const n = Number((draft[p.id] ?? '0').trim() || 0);
      if (!Number.isInteger(n) || Math.abs(n) > 9999) {
        toast(t('admin.weight.invalid'), 'error');
        return;
      }
      weights[p.id] = n;
    }
    setSaving(true);
    try {
      await api.put('/admin/platform-weights', { weights });
      for (const [id, n] of Object.entries(weights)) onSaved(id, n);
      toast(t('admin.weight.platformSaved', { n: changed.length }), 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.weight.saveFail'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-2 border-line bg-panel">
      <div className="border-b-2 border-line px-3 py-2.5">
        <h2 className="text-[12px] font-black tracking-wide text-white">
          {t('admin.weight.platformTitle')}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {t('admin.weight.platformHint')}
        </p>
      </div>

      <div className="px-3 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {platforms.map((p) => (
            <label key={p.id} className="flex items-center gap-2 border border-line/60 px-2 py-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0"
                style={{ background: p.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white/85">
                {tx(`platform.${p.id}.name`) || p.short}
              </span>
              <input
                type="number"
                value={draft[p.id] ?? '0'}
                onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                className="h-6 w-12 border border-line bg-transparent text-center text-[11px] font-bold text-white outline-none focus:border-neon"
                aria-label={`${p.short} weight`}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="btn btn-primary text-[11px]"
            onClick={save}
            disabled={saving || !changed.length}
          >
            {saving ? <Spinner className="h-3 w-3" /> : null}
            {t('admin.weight.savePlatforms', { n: changed.length })}
          </button>
          <span className="text-[11px] text-muted">{t('admin.weight.orderNote')}</span>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const { t, tx } = useI18n();

  const [tab, setTab] = useState<Tab>('games');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  const [games, setGames] = useState<Paged<Game> | null>(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  /** '' = 全部；'none' = 只看没归入任何系列的游戏 */
  const [seriesFilter, setSeriesFilter] = useState<'' | 'none'>('');
  const [gamesLoading, setGamesLoading] = useState(true);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [bios, setBios] = useState<BiosItem[]>([]);
  const [biosLoading, setBiosLoading] = useState(false);
  const [biosBusy, setBiosBusy] = useState(false);
  const [biosFile, setBiosFile] = useState<File | null>(null);
  const biosInput = useRef<HTMLInputElement>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [deleting, setDeleting] = useState<Game | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  // 批量选择
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchSeriesOpen, setBatchSeriesOpen] = useState(false);
  const [batchSeriesId, setBatchSeriesId] = useState('');
  const [batchSeriesBusy, setBatchSeriesBusy] = useState(false);
  const [seriesList, setSeriesList] = useState<Series[]>([]);

  const loadStats = useCallback(() => {
    api
      .get<AdminStats>('/admin/stats')
      .then(setStats)
      .catch(() => undefined);
  }, []);

  const loadGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await api.get<Paged<Game>>(
        `/admin/games${api.qs({
          q: search,
          platform: platformFilter,
          series: seriesFilter === 'none' ? 'none' : '',
          page,
          pageSize: 15,
          sort: 'latest',
        })}`,
      );
      setGames(res);
      // 整页被删空时自动回退，避免停在越界的空页
      if (res.items.length === 0 && res.page > 1 && res.total > 0) {
        setPage((p) => (p === res.page ? Math.max(1, p - 1) : p));
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.gamesFail'), 'error');
    } finally {
      setGamesLoading(false);
    }
  }, [search, platformFilter, seriesFilter, page, toast, t]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await api.get<{ items: AdminUser[] }>('/admin/users');
      setUsers(res.items);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.usersFail'), 'error');
    } finally {
      setUsersLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    api
      .get<{ items: Platform[] }>('/platforms')
      .then((r) => setPlatforms(r.items))
      .catch(() => undefined);
    loadStats();
  }, [user, loadStats]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    loadGames();
  }, [user, loadGames]);

  useEffect(() => {
    if (!user || user.role !== 'admin' || tab !== 'users') return;
    loadUsers();
  }, [user, tab, loadUsers]);

  const loadBios = useCallback(async () => {
    setBiosLoading(true);
    try {
      const res = await api.get<{ items: BiosItem[] }>('/admin/bios');
      setBios(res.items);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.biosFail'), 'error');
    } finally {
      setBiosLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user || user.role !== 'admin' || tab !== 'bios') return;
    loadBios();
  }, [user, tab, loadBios]);

  if (authLoading) return <PageLoader label="CHECKING" />;
  if (!user) return <Navigate to="/login?redirect=%2Fadmin" replace />;

  if (user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <EmptyState
          title={t('admin.noPerm')}
          description={t('admin.noPermDesc')}
          action={
            <Link to="/" className="btn btn-primary">
              {t('admin.backHome')}
            </Link>
          }
        />
      </div>
    );
  }

  const refreshAll = () => {
    loadStats();
    loadGames();
  };

  const confirmDeleteGame = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/admin/games/${deleting.id}`);
      toast(t('admin.toast.gameDeleted', { title: deleting.title }), 'success');
      setDeleting(null);
      refreshAll();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.deleteFail'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** 批量删除选中的游戏（先在确认框里确认，删除会连 ROM 文件一起删） */
  const confirmBatchDelete = async () => {
    if (!selected.size) return;
    setBatchDeleting(true);
    try {
      const res = await api.post<{ removed: number }>('/admin/games/batch-delete', {
        ids: [...selected],
      });
      toast(t('admin.toast.batchDeleted', { n: res.removed }), 'success');
      setSelected(new Set());
      setBatchDeleteOpen(false);
      refreshAll();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.deleteFail'), 'error');
    } finally {
      setBatchDeleting(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 打开批量归类弹窗前加载系列列表 */
  const openBatchSeries = async () => {
    setBatchSeriesId('');
    setBatchSeriesOpen(true);
    try {
      const res = await api.get<{ items: Series[] }>('/admin/series');
      setSeriesList(res.items);
    } catch {
      setSeriesList([]);
    }
  };

  /** 批量归类到系列（seriesId 为空 = 脱离系列） */
  const confirmBatchSeries = async () => {
    if (!selected.size) return;
    setBatchSeriesBusy(true);
    try {
      await api.post('/admin/games/batch-series', {
        ids: [...selected],
        seriesId: batchSeriesId || null,
      });
      toast(t('admin.toast.seriesDone', { n: selected.size }), 'success');
      setBatchSeriesOpen(false);
      setSelected(new Set());
      refreshAll();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.seriesFail'), 'error');
    } finally {
      setBatchSeriesBusy(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser) return;
    setBusy(true);
    try {
      await api.del(`/admin/users/${deletingUser.id}`);
      toast(t('admin.toast.userDeleted'), 'success');
      setDeletingUser(null);
      loadUsers();
      loadStats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.deleteFail'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** 扫描 data/roms/<平台>/：新文件按默认资料上架，丢了文件的条目改标记「缺 ROM」 */
  const scanRoms = async () => {
    setScanning(true);
    try {
      const res = await api.post<{
        scanned: number;
        created: { title: string }[];
        restored: { title: string }[];
        relinked: { title: string }[];
        missing: { title: string }[];
        skipped: { file: string; reason: string }[];
        unresolved: string[];
      }>('/admin/roms/scan');
      if (res.created.length) {
        toast(t('admin.toast.scanDone', { n: res.created.length }), 'success');
      }
      if (res.restored.length) {
        toast(t('admin.toast.scanRestored', { n: res.restored.length }), 'success');
      }
      if (res.missing.length) {
        toast(t('admin.toast.scanMissing', { n: res.missing.length }), 'info');
      }
      if (!res.created.length && !res.restored.length && !res.missing.length) {
        toast(t('admin.toast.scanNone'), 'info');
      }
      if (res.skipped.length) {
        toast(t('admin.toast.scanSkipped', { n: res.skipped.length }), 'info');
      }
      if (res.unresolved?.length) {
        const names = res.unresolved.slice(0, 3).join('、');
        toast(
          t('admin.toast.scanUnresolved', {
            names,
            more: res.unresolved.length > 3 ? ` +${res.unresolved.length - 3}` : '',
          }),
          'error',
        );
      }
      refreshAll();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.scanFail'), 'error');
    } finally {
      setScanning(false);
    }
  };

  const uploadBios = async () => {
    if (!biosFile) return;
    setBiosBusy(true);
    try {
      const fd = new FormData();
      fd.append('bios', biosFile);
      const res = await api.postForm<{ item: { name: string } }>('/admin/bios', fd);
      toast(t('admin.toast.biosUploaded', { name: res.item.name }), 'success');
      setBiosFile(null);
      if (biosInput.current) biosInput.current.value = '';
      loadBios();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.biosUploadFail'), 'error');
    } finally {
      setBiosBusy(false);
    }
  };

  const removeBios = async (name: string) => {
    setBiosBusy(true);
    try {
      await api.del(`/admin/bios/${encodeURIComponent(name)}`);
      toast(t('admin.toast.biosDeleted', { name }), 'success');
      loadBios();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.toast.deleteFail'), 'error');
    } finally {
      setBiosBusy(false);
    }
  };

  /** 平台筛选 + 未归档：紧跟在批量操作栏「归类到系列」右侧 */
  const gameFilters = (
    <>
      <select
        value={platformFilter}
        onChange={(e) => {
          setPlatformFilter(e.target.value);
          setPage(1);
        }}
        className="h-8 shrink-0 border-2 border-line bg-[#0f0f16] px-2 text-xs text-white outline-none focus:border-neon"
        aria-label={t('admin.filter.platform')}
      >
        <option value="">{t('admin.filter.allPlatforms')}</option>
        {platforms.map((p) => (
          <option key={p.id} value={p.id}>
            {tx(`platform.${p.id}.name`) || p.short}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          setSeriesFilter((v) => (v === 'none' ? '' : 'none'));
          setPage(1);
        }}
        aria-pressed={seriesFilter === 'none'}
        title={t('admin.filter.unassignedHint')}
        className={`h-8 shrink-0 border-2 px-3 text-xs font-bold transition-colors ${
          seriesFilter === 'none'
            ? 'border-neon bg-neon/10 text-neon'
            : 'border-line bg-[#0f0f16] text-muted hover:border-neon/50 hover:text-white'
        }`}
      >
        {t('admin.filter.unassigned')}
      </button>
    </>
  );

  /** 当前页的游戏 id：全选 / 取消全选都只作用于这一页，不动其它页已选的 */
  const pageIds = games?.items.map((g) => g.id) ?? [];
  const pageSelectedCount = pageIds.filter((id) => selected.has(id)).length;
  const allPageSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;
  /** 选中但不在本页的数量：跨页勾选时提示，防止误删看不见的游戏 */
  const offPageSelected = selected.size - pageSelectedCount;

  const togglePage = () => {
    if (!pageIds.length) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-5 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-white sm:text-2xl">
            <span className="inline-block h-5 w-1 bg-neon" />
            {t('admin.title')}
          </h1>
          <p className="mt-1 text-[11px] text-muted">
            {t('admin.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-ghost text-xs"
            onClick={scanRoms}
            disabled={scanning}
            title={t('admin.romScanHint')}
          >
            {scanning ? <Spinner className="h-3.5 w-3.5" /> : <IconDisc className="h-3.5 w-3.5" />}
            {t('admin.romScan')}
          </button>
          <button
            className="btn btn-primary text-xs"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <IconPlus className="h-3.5 w-3.5" /> {t('admin.newGame')}
          </button>
        </div>
      </div>

      {/* 数据概览 */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard label={t('admin.stat.games')} value={stats?.games ?? '—'} icon={<IconGamepad className="h-4 w-4" />} accent="#4cc9ff" />
        <StatCard label={t('admin.stat.users')} value={stats?.users ?? '—'} icon={<IconUsers className="h-4 w-4" />} accent="#22d3ee" />
        <StatCard label={t('admin.stat.plays')} value={stats ? formatCount(stats.plays) : '—'} icon={<IconDisc className="h-4 w-4" />} accent="#3ddc84" />
        <StatCard label={t('admin.stat.favorites')} value={stats ? formatCount(stats.favorites) : '—'} icon={<IconHeart className="h-4 w-4" />} accent="#ffd166" />
      </div>

      {stats && stats.missingRom > 0 && (
        <p className="mt-3 border-l-2 border-[#ffb020] bg-[#ffb020]/5 px-3 py-2 text-[11px] text-[#ffb020]">
          {t('admin.missingRom', { n: stats.missingRom })}
        </p>
      )}

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b-2 border-line">
        <div className="flex min-w-0 items-center gap-0 overflow-x-auto">
          {[
            { id: 'games' as Tab, label: t('admin.tab.games') },
            { id: 'platforms' as Tab, label: t('admin.tab.platforms') },
            { id: 'series' as Tab, label: t('admin.tab.series') },
            { id: 'users' as Tab, label: t('admin.tab.users') },
            { id: 'bios' as Tab, label: t('admin.tab.bios') },
            { id: 'texts' as Tab, label: t('admin.tab.texts') },
            { id: 'assets' as Tab, label: t('admin.tab.assets') },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-bold transition-colors sm:px-4 ${
                tab === item.id ? 'text-neon' : 'text-muted hover:text-white'
              }`}
            >
              {item.label}
              {tab === item.id && <span className="absolute inset-x-2 -bottom-0.5 h-0.5 bg-neon" />}
            </button>
          ))}
        </div>

        {tab === 'games' && (
          <div className="mb-1.5 flex items-center gap-2">
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(keyword.trim());
              }}
            >
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('admin.searchGames')}
                className="h-8 w-36 border-2 border-line bg-[#0f0f16] pl-8 pr-2 text-xs text-white outline-none focus:border-neon sm:w-52"
              />
            </form>
          </div>
        )}
      </div>

      {tab === 'games' ? (
        <div className="mt-4">
          <p className="mb-3 border-l-2 border-neon/40 bg-neon/[0.04] px-3 py-2 text-[11px] leading-relaxed text-muted">
            {t('admin.romScanHint')}
          </p>

          {gamesLoading ? (
            <div className="flex justify-center py-16 text-muted">
              <Spinner className="h-6 w-6" />
            </div>
          ) : !games || games.items.length === 0 ? (
            <>
              {/* 筛选结果为空时也要留着筛选控件，否则无法取消筛选 */}
              {search || platformFilter || seriesFilter ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">{gameFilters}</div>
              ) : null}
              <EmptyState
                title={
                  seriesFilter === 'none' && !search && !platformFilter
                    ? t('admin.games.emptyUnassigned')
                    : search || platformFilter || seriesFilter
                      ? t('admin.games.empty')
                      : t('admin.games.none')
                }
                description={
                  seriesFilter === 'none' && !search && !platformFilter
                    ? t('admin.games.emptyUnassignedDesc')
                    : search || platformFilter || seriesFilter
                      ? t('admin.games.emptyDesc')
                      : t('admin.games.noneDesc')
                }
                action={
                  !search && !platformFilter && !seriesFilter ? (
                    <button
                      className="btn btn-primary text-xs"
                      onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                      }}
                    >
                      <IconPlus className="h-3.5 w-3.5" /> {t('admin.games.uploadFirst')}
                    </button>
                  ) : null
                }
              />
            </>
          ) : (
            <>
              {/* 批量管理工具栏 */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-ghost text-xs"
                  onClick={togglePage}
                  disabled={!pageIds.length}
                  aria-pressed={allPageSelected}
                  title={t('admin.batch.selectAllHint', { n: pageIds.length })}
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  {allPageSelected ? t('admin.batch.unselectAll') : t('admin.batch.selectAll')}
                </button>
                <button
                  className="btn btn-danger text-xs"
                  onClick={() => setBatchDeleteOpen(true)}
                  disabled={!selected.size || batchDeleting}
                >
                  {batchDeleting ? <Spinner className="h-3.5 w-3.5" /> : <IconTrash className="h-3.5 w-3.5" />}
                  {t('admin.batch.delete', { n: selected.size })}
                </button>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={openBatchSeries}
                  disabled={!selected.size}
                >
                  {t('admin.batch.series', { n: selected.size })}
                </button>
                <span className="mx-1 h-5 w-0.5 shrink-0 bg-line/70" aria-hidden />
                {gameFilters}
                {selected.size > 0 && (
                  <>
                    <span className="text-[11px] text-muted">
                      {t('admin.batch.selectedCount', { n: selected.size })}
                      {offPageSelected > 0 ? t('admin.batch.offPage', { n: offPageSelected }) : ''}
                    </span>
                    <button
                      className="text-[11px] font-bold text-muted hover:text-white"
                      onClick={() => setSelected(new Set())}
                    >
                      {t('admin.batch.clear')}
                    </button>
                  </>
                )}
              </div>

              <div className="overflow-hidden border-2 border-line bg-panel">
                <div className="hidden grid-cols-[36px_1fr_104px_64px_72px_84px_128px] gap-3 border-b-2 border-line bg-[#101018] px-3 py-2 text-[11px] font-black tracking-wide text-muted md:grid">
                  <span className="flex items-center">
                    <SelectAllBox
                      checked={allPageSelected}
                      indeterminate={somePageSelected}
                      onChange={togglePage}
                      label={t('admin.batch.selectAllHint', { n: pageIds.length })}
                    />
                  </span>
                  <span>{t('admin.th.game')}</span>
                  <span>{t('admin.th.platform')}</span>
                  <span className="text-right">{t('admin.th.plays')}</span>
                  <span className="text-center">{t('admin.th.weight')}</span>
                  <span className="text-right">{t('admin.th.status')}</span>
                  <span className="text-right">{t('admin.th.actions')}</span>
                </div>

                {games.items.map((g) => {
                  const checked = selected.has(g.id);
                  return (
                  <div
                    key={g.id}
                    className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line/60 px-3 py-2 transition-colors last:border-0 hover:bg-white/[0.03] md:grid-cols-[36px_1fr_104px_64px_72px_84px_128px] ${
                      checked ? 'bg-neon/[0.05]' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(g.id)}
                      className="h-3.5 w-3.5 accent-[#4cc9ff]"
                      aria-label={g.title}
                    />
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-10 w-[30px] shrink-0 overflow-hidden border border-line bg-[#0f0f16]">
                        <GameCover game={g} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-white">{g.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted">
                          {[g.year, g.developer, g.genre].filter(Boolean).join(' · ') || '—'}
                          {g.featured && <span className="ml-1.5 text-[#ffd166]">{t('game.featured')}</span>}
                          {g.seriesId && (
                            <span className="ml-1.5 text-neon">
                              {t('admin.series.badge', { name: g.seriesName })}
                            </span>
                          )}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 md:hidden">
                          <PlatformBadge name={g.platformShort} color={g.platformColor} />
                          <span className="text-[10px] text-muted">
                            {formatCount(g.playCount)} {t('game.playCount')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <PlatformBadge name={g.platformShort} color={g.platformColor} />
                    </div>

                    <div className="hidden text-right text-xs font-bold text-white/60 md:block">
                      {formatCount(g.playCount)}
                    </div>

                    <div className="hidden md:flex md:justify-center">
                      <WeightInput
                        game={g}
                        onSaved={(id, weight) =>
                          setGames((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  items: prev.items.map((x) => (x.id === id ? { ...x, weight } : x)),
                                }
                              : prev,
                          )
                        }
                      />
                    </div>

                    <div className="hidden text-right md:block">
                      <span
                        title={g.romMissing ? t('admin.status.lostHint') : undefined}
                        className={`inline-block border px-1.5 py-0.5 text-[10px] font-bold ${
                          g.hasRom
                            ? 'border-[#3ddc84]/40 bg-[#3ddc84]/10 text-[#3ddc84]'
                            : g.romMissing
                              ? 'border-[#ff5b7f]/40 bg-[#ff5b7f]/10 text-[#ff8fa8]'
                              : 'border-[#ffb020]/40 bg-[#ffb020]/10 text-[#ffb020]'
                        }`}
                      >
                        {g.hasRom
                          ? t('admin.status.ready')
                          : g.romMissing
                            ? t('admin.status.lost')
                            : t('admin.status.missing')}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        to={`/game/${g.id}`}
                        className="flex h-7 items-center border border-line px-2 text-[11px] font-bold text-muted transition-colors hover:border-white/40 hover:text-white"
                      >
                        {t('admin.action.view')}
                      </Link>
                      <button
                        onClick={() => {
                          setEditing(g);
                          setFormOpen(true);
                        }}
                        className="flex h-7 w-7 items-center justify-center border border-line text-muted transition-colors hover:border-cyan hover:text-cyan"
                        aria-label={t('action.edit')}
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(g)}
                        className="flex h-7 w-7 items-center justify-center border border-line text-muted transition-colors hover:border-[#ff5b7f] hover:text-[#ff5b7f]"
                        aria-label={t('action.delete')}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="mt-2 text-[11px] text-muted">
                  {t('admin.games.total', { n: games.total })}
                  {search ? t('admin.games.keyword', { q: search }) : ''}
                </p>
                <Pagination page={games.page} totalPages={games.totalPages} onChange={setPage} />
              </div>
            </>
          )}
        </div>
      ) : tab === 'platforms' ? (
        <div className="mt-4">
          <PlatformWeights
            platforms={platforms}
            onSaved={(id, weight) =>
              setPlatforms((prev) => prev.map((p) => (p.id === id ? { ...p, weight } : p)))
            }
          />
        </div>
      ) : tab === 'series' ? (
        <AdminSeries />
      ) : tab === 'users' ? (
        <div className="mt-4">
          {usersLoading ? (
            <div className="flex justify-center py-16 text-muted">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <div className="overflow-hidden border-2 border-line bg-panel">
              <div className="hidden grid-cols-[1fr_100px_100px_100px_90px] gap-3 border-b-2 border-line bg-[#101018] px-3 py-2 text-[11px] font-black tracking-wide text-muted sm:grid">
                <span>{t('admin.th.user')}</span>
                <span>{t('admin.th.role')}</span>
                <span className="text-right">{t('admin.th.favorites')}</span>
                <span className="text-right">{t('admin.th.created')}</span>
                <span className="text-right">{t('admin.th.actions')}</span>
              </div>
              {users.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line/60 px-3 py-2.5 last:border-0 sm:grid-cols-[1fr_100px_100px_100px_90px]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-neon/15 text-[11px] font-black text-neon">
                      {u.username.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-white">{u.username}</p>
                      <p className="text-[10px] text-muted sm:hidden">
                        {u.role === 'admin' ? t('admin.role.admin') : t('admin.role.user')} ·{' '}
                        {formatDate(u.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <span
                      className={`border px-1.5 py-0.5 text-[10px] font-bold ${
                        u.role === 'admin'
                          ? 'border-neon/40 bg-neon/10 text-neon'
                          : 'border-line bg-white/5 text-muted'
                      }`}
                    >
                      {u.role === 'admin' ? t('admin.role.admin') : t('admin.role.user')}
                    </span>
                  </div>
                  <div className="hidden text-right text-xs text-white/60 sm:block">
                    {u.favCount} / {u.playCount}
                  </div>
                  <div className="hidden text-right text-[11px] text-muted sm:block">
                    {formatDate(u.createdAt)}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => setDeletingUser(u)}
                      disabled={u.id === user.id}
                      className="flex h-7 w-7 items-center justify-center border border-line text-muted transition-colors hover:border-[#ff5b7f] hover:text-[#ff5b7f] disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={t('admin.users.delete')}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'bios' ? (
        <div className="mt-4 space-y-3">
          <div className="border-2 border-line bg-panel p-4">
            <h2 className="text-sm font-black text-white">{t('admin.bios.title')}</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {t('admin.bios.desc')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={biosInput}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => setBiosFile(e.target.files?.[0] || null)}
              />
              <button className="btn btn-ghost text-xs" onClick={() => biosInput.current?.click()}>
                <IconUpload className="h-3.5 w-3.5" /> {t('admin.bios.pick')}
              </button>
              <span className="text-[11px] text-muted">
                {biosFile
                  ? `${biosFile.name} · ${formatBytes(biosFile.size)}`
                  : t('admin.bios.noFile')}
              </span>
              <button
                className="btn btn-primary ml-auto text-xs"
                disabled={!biosFile || biosBusy}
                onClick={uploadBios}
              >
                {biosBusy ? <Spinner className="h-3.5 w-3.5" /> : null} {t('admin.bios.upload')}
              </button>
            </div>
          </div>

          <div className="overflow-hidden border-2 border-line bg-panel">
            <div className="hidden grid-cols-[1fr_90px_70px_140px_60px] gap-3 border-b-2 border-line bg-[#101018] px-3 py-2 text-[11px] font-black tracking-wide text-muted sm:grid">
              <span>{t('admin.th.name')}</span>
              <span className="text-right">{t('admin.th.size')}</span>
              <span className="text-right">{t('admin.th.used')}</span>
              <span className="text-right">{t('admin.th.uploaded')}</span>
              <span className="text-right">{t('admin.th.actions')}</span>
            </div>
            {biosLoading ? (
              <div className="flex justify-center py-10 text-muted">
                <Spinner className="h-6 w-6" />
              </div>
            ) : bios.length === 0 ? (
              <p className="px-3 py-10 text-center text-[11px] text-muted">
                {t('admin.bios.empty')}
              </p>
            ) : (
              bios.map((b) => (
                <div
                  key={b.name}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line/60 px-3 py-2.5 last:border-0 sm:grid-cols-[1fr_90px_70px_140px_60px]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[12px] font-bold text-white">{b.name}</p>
                    <p className="text-[10px] text-muted sm:hidden">
                      {formatBytes(b.size)} · {t('admin.bios.used', { n: b.usedBy })} ·{' '}
                      {formatDate(b.uploadedAt)}
                    </p>
                  </div>
                  <div className="hidden text-right text-[11px] text-white/60 sm:block">
                    {formatBytes(b.size)}
                  </div>
                  <div className="hidden text-right text-[11px] text-white/60 sm:block">
                    {b.usedBy}
                  </div>
                  <div className="hidden text-right text-[11px] text-muted sm:block">
                    {formatDate(b.uploadedAt)}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => removeBios(b.name)}
                      disabled={biosBusy || b.usedBy > 0}
                      title={b.usedBy > 0 ? t('admin.bios.inUse') : t('action.delete')}
                      className="flex h-7 w-7 items-center justify-center border border-line text-muted transition-colors hover:border-[#ff5b7f] hover:text-[#ff5b7f] disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={t('admin.bios.delete')}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : tab === 'texts' ? (
        <AdminTexts />
      ) : (
        <AdminAssets />
      )}

      <AdminGameForm
        open={formOpen}
        initial={editing}
        platforms={platforms}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          refreshAll();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('admin.confirm.gameTitle')}
        message={t('admin.confirm.gameMsg', { title: deleting?.title || '' })}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDeleteGame}
      />

      <ConfirmDialog
        open={!!deletingUser}
        title={t('admin.confirm.userTitle')}
        message={t('admin.confirm.userMsg', { name: deletingUser?.username || '' })}
        busy={busy}
        onCancel={() => setDeletingUser(null)}
        onConfirm={confirmDeleteUser}
      />

      {/* 批量删除：全选后一次可能删掉整页，必须先确认 */}
      <ConfirmDialog
        open={batchDeleteOpen}
        title={t('admin.confirm.batchTitle')}
        message={
          t('admin.confirm.batchMsg', { n: selected.size }) +
          (offPageSelected > 0 ? t('admin.confirm.batchOffPage', { n: offPageSelected }) : '')
        }
        busy={batchDeleting}
        onCancel={() => !batchDeleting && setBatchDeleteOpen(false)}
        onConfirm={confirmBatchDelete}
      />

      {/* 批量归类到系列 */}
      <Modal
        open={batchSeriesOpen}
        onClose={() => !batchSeriesBusy && setBatchSeriesOpen(false)}
        title={t('admin.batch.seriesTitle')}
        width="max-w-md"
        footer={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => setBatchSeriesOpen(false)}
              disabled={batchSeriesBusy}
            >
              {t('action.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={confirmBatchSeries}
              disabled={batchSeriesBusy}
            >
              {batchSeriesBusy ? <Spinner className="h-4 w-4" /> : null}
              {t('admin.batch.seriesConfirm')}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm leading-relaxed text-white/75">
          {t('admin.batch.seriesMsg', { n: selected.size })}
        </p>
        <label className="label">{t('form.series')}</label>
        <select
          className="field"
          value={batchSeriesId}
          onChange={(e) => setBatchSeriesId(e.target.value)}
        >
          <option value="">{t('admin.batch.seriesDetach')}</option>
          {seriesList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.platform
                ? ` (${tx(`platform.${s.platform}.short`) || tx(`platform.${s.platform}.name`) || s.platform})`
                : ''}
            </option>
          ))}
        </select>
      </Modal>
    </div>
  );
}
