import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getToken } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import {
  IconArrowLeft,
  IconGamepad,
  IconMonitor,
  IconPlay,
  IconSparkle,
  IconTool,
} from '../components/Icons';
import { EmptyState, PageLoader, PlatformBadge, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import type { Game } from '../types';

type Status = 'loading' | 'ready' | 'error';

/**
 * 按 EmulatorJS 内部的规则推导核心文件名（`<core>-wasm.data` / `<core>-legacy-wasm.data`）：
 * 没有 WebGL2、或核心 report 未声明 defaultWebGL2 时，它会走 legacy 版本。
 * 推导失败也不影响可用性 —— 只是预取不到，退回模拟器自己下载。
 */
async function resolveCoreFile(base: string, core: string, signal: AbortSignal): Promise<string> {
  let defaultWebGL2 = false;
  try {
    const res = await fetch(`${base}cores/reports/${core}.json`, { signal });
    if (res.ok) {
      const json: any = await res.json();
      defaultWebGL2 = !!(json && json.options && json.options.defaultWebGL2);
    }
  } catch {
    /* report 拿不到就按 legacy 处理，和 EJS 的行为一致 */
  }
  let supportsWebgl2 = false;
  try {
    supportsWebgl2 = !!document.createElement('canvas').getContext('webgl2');
  } catch {
    /* ignore */
  }
  const legacy = !(supportsWebgl2 && defaultWebGL2);
  return `${core}${legacy ? '-legacy' : ''}-wasm.data`;
}

/**
 * 下载核心文件（约 8MB）。EmulatorJS 自己的下载没有重试，网络抖动一次就直接
 * 转到不可达的公网 CDN，于是表现为「有时候加载核心失败，刷新又好了」。
 * 这里自己下载：超时中止、失败退避重试、按 content-length 校验完整性。
 */
async function fetchCoreBlob(
  url: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
  retries = 3,
): Promise<Blob> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length') || 0);
      if (!res.body) return await res.blob();
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          if (total) onProgress(Math.min(100, Math.round((loaded / total) * 100)));
        }
      }
      if (total && loaded !== total) throw new Error(`文件不完整 ${loaded}/${total}`);
      return new Blob(chunks as unknown as BlobPart[], { type: 'application/octet-stream' });
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err;
      if (i < retries) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('核心下载失败');
}

/**
 * 模拟器运行时（emulator.min.js）在同一个页面里只能注入一次：
 * 它用 `class EJS_STORAGE {}` 这类顶层声明，二次执行会抛
 * "Identifier 'EJS_STORAGE' has already been declared"，之后所有实例都建不起来
 * —— 这也是以前「重试 / 重启之后就再也起不来、只能刷新」的原因。
 */
const runtimeCache = new Map<string, Promise<any>>();
const langCache = new Map<string, Promise<Record<string, string> | null>>();

function loadEmulatorRuntime(dataPath: string): Promise<any> {
  const cached = runtimeCache.get(dataPath);
  if (cached) return cached;

  const w = window as any;
  const task = (async () => {
    if (w.EmulatorJS) return w.EmulatorJS;

    if (!document.querySelector('link[data-ejs-runtime]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${dataPath}emulator.min.css`;
      css.dataset.ejsRuntime = '1';
      document.head.appendChild(css);
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${dataPath}emulator.min.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`无法加载模拟器运行时：${dataPath}emulator.min.js`));
      document.head.appendChild(script);
    });

    if (!w.EmulatorJS) throw new Error('emulator.min.js 未导出 EmulatorJS');
    return w.EmulatorJS;
  })();

  runtimeCache.set(dataPath, task);
  // 失败不要把错误缓存住，换个 CDN 还要能重试
  task.catch(() => runtimeCache.delete(dataPath));
  return task;
}

/**
 * 修复 EmulatorJS 4.2.3 的手柄 bug（rommapp/romm#4797 / #5139）。
 *
 * 根因一（#4797）：EmulatorJS 的 gamepad「connected」处理器在控制界面
 * （gamepadLabels）尚未创建时会提前 return，之后不再重新扫描
 * navigator.getGamepads()。浏览器只会在「用户第一次按下手柄按键」时通告一次手柄，
 * 而这次通告通常发生在模拟器实例创建之前 —— 于是手柄从未被分配到 Player 1。
 *
 * 根因二（#5139，蓝牙/USB 转蓝牙手柄高发）：蓝牙手柄在 getGamepads() 里的 index
 * 往往是稀疏的（1、2、3…，或断开重连后残留更大值），而 EmulatorJS 用
 * `gamepads[t.gamepadIndex]` 直接按 index 当下标访问数组，一旦 index ≠ 数组位置就
 * 抛 `Cannot read properties of undefined (reading 'id')`，这个 TypeError 会打断整个
 * 手柄轮询循环，之后所有输入都不再生效。
 *
 * 修复：① 规范化 navigator.getGamepads() 返回值，让手柄 index 从 0 连续排列（源头
 * 消除稀疏 index bug）；② 模拟器就绪后把手柄重新注入实例并派发 connected，触发
 * 自动分配。两者配合，键盘、有线手柄、蓝牙手柄都能正常控制。
 */

/** 克隆一个 Gamepad 快照（Gamepad 的字段是原型 getter，Object.assign 拿不到） */
function cloneGamepadSnapshot(p: Gamepad, index: number): Gamepad {
  const buttons = Array.prototype.map.call(p.buttons || [], (b: any) => ({
    pressed: !!b.pressed,
    touched: !!b.touched,
    value: Number(b.value) || 0,
  }));
  const axes = Array.prototype.slice.call(p.axes || []);
  const clone: any = {
    id: p.id,
    index,
    connected: true,
    timestamp: p.timestamp,
    mapping: p.mapping,
    axes,
    buttons,
  };
  if ((p as any).vibrationActuator) clone.vibrationActuator = (p as any).vibrationActuator;
  return clone as Gamepad;
}

/** 覆写 navigator.getGamepads：把手柄 index 重新按 0、1、2… 连续编号 */
function installGamepadIndexNormalizer() {
  const w = window as any;
  if (w.__abxyGamepadIndexFix) return;
  w.__abxyGamepadIndexFix = true;

  const nav = navigator as any;
  const native = nav.getGamepads?.bind(nav);
  if (!native) return;

  const normalize = function () {
    let raw: any[] = [];
    try {
      raw = native();
    } catch {
      return [];
    }
    if (!raw || !raw.length) return [];
    const out: Gamepad[] = [];
    let idx = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const p = raw[i];
      if (!p || !p.connected) continue;
      out.push(cloneGamepadSnapshot(p, idx));
      idx += 1;
    }
    return out;
  };

  try {
    Object.defineProperty(nav, 'getGamepads', {
      value: normalize,
      configurable: true,
      writable: true,
    });
  } catch {
    /* 覆写失败就退回到原生行为 */
  }
}
installGamepadIndexNormalizer();

/**
 * 模拟器就绪后，把手柄重新注入实例并触发自动分配。
 *
 * 关键：不能以「手柄是否已在 gp.gamepads 数组里」作为跳过依据。换游戏时
 * `new GamepadHandler` 会同步执行第一次 updateGamepadState()，把已激活的手柄 push
 * 进 gamepads 并派发 connected，但那一刻 `gamepad.on("connected")` 还没绑定，事件
 * 丢失；之后轮询发现 gamepads 里已有手柄就不再重复派发，导致 gamepadSelection 一直
 * 是空的。所以应以「是否已有手柄被分配到玩家槽（gamepadSelection）」为准。
 */
function assignConnectedGamepads(ejs: any) {
  const gp = ejs?.gamepad;
  if (!gp || !Array.isArray(gp.gamepads)) return;

  // 已分配到玩家槽（gamepadSelection 里存在非空项）就不重复分配
  const selection = Array.isArray(ejs?.gamepadSelection) ? ejs.gamepadSelection : [];
  const assigned = selection.some((s: any) => typeof s === 'string' && s.length > 0);
  if (assigned) return;

  let pads: (Gamepad | null)[] = [];
  try {
    pads = Array.from(navigator.getGamepads?.() || []);
  } catch {
    return;
  }
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad || !pad.connected) continue;
    // 规范化后 index 连续，直接按下标对齐，保证 connected 回调里 gamepads[idx] 可取到
    gp.gamepads[pad.index] = pad;
    try {
      gp.dispatchEvent('connected', { gamepadIndex: pad.index });
    } catch {
      /* 分配失败不阻塞游戏 */
    }
  }
}

/** 语言包同样只取一次，取不到就用英文兜底（不影响运行） */
function loadEmulatorLang(dataPath: string, lang: string) {
  const key = `${dataPath}|${lang}`;
  const cached = langCache.get(key);
  if (cached) return cached;
  const task = (async () => {
    try {
      const res = await fetch(`${dataPath}localization/${lang}.json`);
      if (!res.ok) return null;
      return (await res.json()) as Record<string, string>;
    } catch {
      return null;
    }
  })();
  langCache.set(key, task);
  return task;
}

export default function Play() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const toast = useToast();

  const mountRef = useRef<HTMLDivElement>(null);
  const ejsRef = useRef<any>(null);
  // 退出是否已处理（防止 stopEmulator→callEvent('exit')→leaveToDetail 循环）
  const exitingRef = useRef(false);
  // 返回上一页：优先走浏览器历史；直接访问（无上一页）时兜底跳详情页
  const goBack = () => {
    const idx = (window.history.state && (window.history.state as any).idx) ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/game/${id}`, { replace: true });
  };
  // 兜底：模拟器还没起来（效果未注册）时点返回也能正常回详情页。
  const leaveRef = useRef<() => void>(goBack);
  const [game, setGame] = useState<Game | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [padConnected, setPadConnected] = useState(false);
  const [cdn, setCdn] = useState('/emulatorjs/');
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  // 核心下载失败自动重试的次数（跨 effect 保留，避免死循环重试）
  const autoRetryRef = useRef(0);
  const [repairBusy, setRepairBusy] = useState(false);

  // 进入需要登录（等登录态恢复完成再判断，否则会误跳登录页）
  useEffect(() => {
    if (authLoading || user) return;
    navigate(`/login?redirect=${encodeURIComponent(`/play/${id}`)}`, { replace: true });
  }, [authLoading, user, id, navigate]);

  // 读取游戏信息 + 模拟器 CDN 配置
  useEffect(() => {
    let alive = true;
    Promise.all([api.get<{ game: Game }>(`/games/${id}`), api.get<{ emulatorCdn?: string }>('/config')])
      .then(([gameRes, cfg]) => {
        if (!alive) return;
        setGame(gameRes.game);
        if (cfg.emulatorCdn) setCdn(cfg.emulatorCdn);
        if (!gameRes.game.hasRom) {
          setStatus('error');
          setError('这个游戏还没有上传 ROM，暂时无法游玩。');
        } else if (gameRes.game.needsBios && !gameRes.game.biosName) {
          setStatus('error');
          setError('这个街机游戏需要 BIOS 文件才能启动，请管理员先在「BIOS 管理」上传并在游戏里挂载。');
        }
      })
      .catch((e) => {
        if (!alive) return;
        setStatus('error');
        setError(e?.message || '游戏加载失败');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // 记录一次游玩
  useEffect(() => {
    if (!user || !game) return;
    api.post(`/games/${game.id}/play`).catch(() => undefined);
  }, [user, game]);

  /**
   * 自助修复：ROM 还压在 zip 里时，模拟器要自己解压；中文 Windows 打的包条目名
   * 是 GBK，解出乱码后找不到 ROM 就静默退回主菜单（看起来像「点了没反应」）。
   * 解出裸 ROM 后 romUrl 末段换成真实扩展名，实例重建一次就能进游戏。
   */
  const repairAndRestart = async () => {
    if (!game || repairBusy) return;
    setRepairBusy(true);
    try {
      const res = await api.post<{ ok: boolean; game: Game | null }>(
        `/games/${game.id}/repair-rom`,
      );
      if (res.game) setGame(res.game);
      setError('');
      // attempt 在启动 effect 的依赖里，加一才会用新的 romUrl 重建实例
      setAttempt((a) => a + 1);
      toast(t('game.repairOk'), 'success');
    } catch (e) {
      toast((e as Error)?.message || t('state.error'), 'error');
    } finally {
      setRepairBusy(false);
    }
  };

  // 手柄连接状态 + 连接时同步注入正在运行的模拟器实例
  useEffect(() => {
    const update = () => {
      const pads = navigator.getGamepads?.() || [];
      setPadConnected(Array.from(pads).some((p) => p && p.connected));
      // 手柄在游戏运行中连接/重连时，主动补扫进模拟器（EmulatorJS 可能已错过 connected 事件）
      const ejs = ejsRef.current || (window as any).EJS_emulator;
      if (ejs) assignConnectedGamepads(ejs);
    };
    update();
    window.addEventListener('gamepadconnected', update);
    window.addEventListener('gamepaddisconnected', update);
    const timer = window.setInterval(update, 2000);
    return () => {
      window.removeEventListener('gamepadconnected', update);
      window.removeEventListener('gamepaddisconnected', update);
      window.clearInterval(timer);
    };
  }, []);

  // 启动模拟器
  useEffect(() => {
    // authLoading 参与依赖：登录态比游戏数据晚到时，这次渲染还是 PageLoader，
    // mountRef 为空；等登录态就绪页面才真正挂载，依赖没变就再也不会重跑（卡在 0% 的根因）
    if (authLoading) return;
    if (!game || !game.hasRom || !mountRef.current) return;
    if (game.needsBios && !game.biosName) return;
    const container = mountRef.current;
    let observer: MutationObserver | null = null;
    let cancelled = false;
    // 预取核心用的中止器：离开页面/重试时立刻掐掉下载，避免旧请求继续吃带宽
    const controller = new AbortController();
    let coreBlobUrl: string | null = null;

    /** 真正停掉内核：暂停主循环 + 挂起音频，否则离开页面后声音还在响 */
    const stopEmulator = () => {
      const ejs = ejsRef.current || (window as any).EJS_emulator;
      if (!ejs) return;
      // 主动触发 EmulatorJS 的退出清理流程：保存存档 → 停主循环 → 卸载存档 →
      // 1s 后 Module.abort() 彻底终止 wasm（这是唯一能可靠停掉背景音乐的手段）。
      // callEvent('exit') 会同步触发 gameManager 内部 on('exit') 的清理逻辑。
      try {
        ejs.callEvent?.('exit');
      } catch {
        /* ignore */
      }
      // 以下兜底：内核还没完全就绪时，上面的 exit 清理可能未覆盖，再补几层暂停
      try {
        ejs.pause?.();
      } catch {
        /* 内核还没启动时忽略 */
      }
      try {
        ejs.Module?.pauseMainLoop?.();
      } catch {
        /* ignore */
      }
      try {
        ejs.Module?.AL?.currentCtx?.suspend?.();
      } catch {
        /* ignore */
      }
      try {
        ejs.gameManager?.toggleMainLoop?.(0);
      } catch {
        /* ignore */
      }
    };

    /** 退出播放页：先停内核，再跳回上一页（详情页） */
    const leaveToDetail = () => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      stopEmulator();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
      goBack();
    };
    leaveRef.current = leaveToDetail;

    setStatus('loading');
    setProgress(0);

    const progressTimer = window.setInterval(() => {
      setProgress((p) => (p >= 92 ? 92 : p + Math.max(1, Math.round((92 - p) / 10))));
    }, 300);

    const dataPath = cdn.endsWith('/') ? cdn : `${cdn}/`;
    const token = getToken();
    const withToken = (url: string) =>
      token ? `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}` : url;
    // core 允许按游戏覆盖（街机可在 fbneo / fbalpha2012_cps1 / cps2 之间切换）
    const coreName = game.core || game.emulatorCore || game.platform;
    let coreFile: string | null = null;

    /**
     * 加载运行时并创建实例。
     * 运行时只注入一次，重试/重启时只是重新 new 一个实例 —— 旧实现每次重挂 loader.js，
     * 会二次执行 emulator.min.js 并直接抛 SyntaxError，导致重试必然失败。
     */
    const boot = async () => {
      if (cancelled) return;
      container.innerHTML = '<div id="ejs-mount" style="height:100%;width:100%"></div>';

      let EmulatorJS: any = null;
      let langJson: Record<string, string> | null = null;
      try {
        [EmulatorJS, langJson] = await Promise.all([
          loadEmulatorRuntime(dataPath),
          loadEmulatorLang(dataPath, 'zh-CN'),
        ]);
      } catch (err) {
        if (cancelled) return;
        window.clearInterval(progressTimer);
        // 本地运行时缺失 → 回退公网 CDN 一次
        if (!/^https?:/i.test(cdn)) {
          setCdn('https://cdn.emulatorjs.org/stable/data/');
          return;
        }
        setError(
          '模拟器内核加载失败：本地运行时不完整，且无法访问公网 CDN。请确认 server/public/emulatorjs 目录存在，或通过环境变量 EMULATOR_CDN 指定可用镜像。',
        );
        setStatus('error');
        console.error('[play] 运行时加载失败', err);
        return;
      }
      if (cancelled) return;

      const instance = new EmulatorJS('#ejs-mount', {
        gameUrl: withToken(game.romUrl || `/api/games/${game.id}/rom`),
        dataPath,
        system: coreName,
        // 街机：FBNeo 要求系统目录里存在完整的 neogeo.zip，
        // 所以用根路径直链（EJS 会把它当作虚拟文件系统的文件名）+ 关闭自动解压，走 Cookie 鉴权
        biosUrl: game.biosName ? `/${game.biosName}` : undefined,
        gameName: game.title,
        color: '#4cc9ff',
        backgroundColor: '#050a1f',
        startOnLoad: true,
        fullscreenOnLoad: false,
        defaultOptions: { 'save-state-location': 'browser' },
        dontExtractBIOS: !!game.biosName,
        // 核心已经下在内存里（blob），内核不会再发网络请求
        filePaths: coreFile && coreBlobUrl ? { [coreFile]: coreBlobUrl } : undefined,
        language: langJson ? 'zh-CN' : undefined,
        langJson,
      });
      ejsRef.current = instance;

      instance.on('ready', () => {
        if (cancelled) return;
        autoRetryRef.current = 0;
        window.clearInterval(progressTimer);
        setProgress(100);
        // 手柄补扫：修复 EmulatorJS 4.2.3 在手柄先连接、模拟器后启动时无法控制的问题
        assignConnectedGamepads(instance);
        window.setTimeout(() => !cancelled && assignConnectedGamepads(instance), 600);
        window.setTimeout(() => !cancelled && setStatus('ready'), 350);
      });
      instance.on('exit', () => {
        if (cancelled) return;
        leaveToDetail();
      });
    };

    /**
     * 先把核心下到内存再交给 EmulatorJS：
     * 它内置的下载没有重试，网络抖一次就直接转去连公网 CDN（国内基本不可达），
     * 表现就是「有时候加载核心失败、刷新又好了」。这里自己重试 + 校验完整性。
     */
    /** 把 EmulatorJS 的原始报错翻译成人话（它把 ROM 404 也叫「网络错误」） */
    const friendlyError = (msg: string) => {
      if (/网络错误|network ?error/i.test(msg)) {
        return '读取游戏数据失败：ROM 文件可能已被移动或删除，请联系管理员检查资源目录。';
      }
      if (/core|download/i.test(msg)) {
        return '模拟器核心下载失败，请检查网络后点「重试」。';
      }
      return msg;
    };

    (async () => {
      // ROM 预检：文件被移动/删除时直接给出准确提示，而不是让模拟器报「网络错误」
      if (game.romUrl) {
        try {
          const head = await fetch(withToken(game.romUrl), {
            method: 'HEAD',
            signal: controller.signal,
          });
          if (head.status === 404) {
            window.clearInterval(progressTimer);
            setError('游戏文件（ROM）已丢失，可能被移动或删除，请联系管理员重新上传。');
            setStatus('error');
            return;
          }
        } catch {
          /* 预览失败不阻塞，交给模拟器自己判断 */
        }
      }
      try {
        const file = await resolveCoreFile(dataPath, coreName, controller.signal);
        const blob = await fetchCoreBlob(
          `${dataPath}cores/${file}`,
          (pct) => {
            // 核心约占进度条 85%，剩下的留给内核初始化
            if (!cancelled) setProgress(Math.round(pct * 0.85));
          },
          controller.signal,
        );
        if (cancelled) return;
        coreFile = file;
        coreBlobUrl = URL.createObjectURL(blob);
        setProgress((p) => Math.max(p, 85));
      } catch (err) {
        if (controller.signal.aborted) return;
        // 预取失败也照常启动，让 EmulatorJS 自己再试一次（它还有 CDN 兜底）
        console.warn('[play] 核心预取失败，回退到 EmulatorJS 内置下载', err);
      }
      void boot();
    })();

    /**
     * 模拟器把失败原因写在 .ejs_error_text 里，但它被我们自己的 loading 遮罩盖住了。
     * 核心类错误自动重试（最多 2 次），其它错误直接把原文显示出来。
     */
    const errorPoll = window.setInterval(() => {
      if (cancelled) return;
      const msg = container.querySelector('.ejs_error_text')?.textContent?.trim() || '';
      if (!msg) return;
      window.clearInterval(errorPoll);
      window.clearInterval(progressTimer);
      if (/core|download|network|fetch/i.test(msg) && autoRetryRef.current < 2) {
        autoRetryRef.current += 1;
        setAttempt((a) => a + 1);
        return;
      }
      setError(`模拟器启动失败：${friendlyError(msg)}`);
      setStatus('error');
    }, 700);

    // 兜底：canvas 出现即视为就绪
    observer = new MutationObserver(() => {
      if (container.querySelector('canvas, iframe')) {
        window.clearInterval(progressTimer);
        setProgress(100);
        window.setTimeout(() => !cancelled && setStatus('ready'), 400);
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    const failSafe = window.setTimeout(() => {
      // 不能用 status 判断：它是本次 effect 闭包里的旧值
      if (cancelled || container.querySelector('canvas, iframe')) return;
      window.clearInterval(progressTimer);
      const msg = container.querySelector('.ejs_error_text')?.textContent?.trim();
      setError(msg ? `模拟器启动失败：${friendlyError(msg)}` : '模拟器启动超时，请点击「重试」。');
      setStatus('error');
    }, 40000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(progressTimer);
      window.clearInterval(errorPoll);
      window.clearTimeout(failSafe);
      observer?.disconnect();
      // 离开页面必须停内核，否则返回后只剩白屏 + 背景音乐
      stopEmulator();
      ejsRef.current = null;
      // 核心的 blob 只在这一轮有效，卸载时必须释放，否则 8MB 常驻内存
      if (coreBlobUrl) {
        try {
          URL.revokeObjectURL(coreBlobUrl);
        } catch {
          /* ignore */
        }
        coreBlobUrl = null;
      }
      container.innerHTML = '';
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, cdn, attempt, authLoading]);

  if (authLoading) return <PageLoader label="CHECKING" />;
  if (!user) return <PageLoader label="REDIRECTING" />;
  if (!game && status === 'loading') return <PageLoader label="BOOTING" />;

  if (status === 'error' && (!game || !game.hasRom)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          title="暂时无法开始游戏"
          description={error}
          action={
            <Link to={game ? `/game/${game.id}` : '/'} className="btn btn-primary">
              {t('play.backDetail')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col bg-[#07070b]">
      {/* 顶部条 */}
      <div className="flex items-center gap-2 border-b-2 border-line bg-[#0d0d13] px-3 py-2 sm:gap-3 sm:px-4">
        <button
          onClick={() => leaveRef.current()}
          className="flex h-8 items-center gap-1.5 border border-line px-2 text-xs font-bold text-white/70 transition-colors hover:border-neon hover:text-neon"
        >
          <IconArrowLeft className="h-3.5 w-3.5" /> {t('action.back')}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-black text-white">{game?.title}</h1>
            {game && (
              <span className="hidden sm:inline">
                <PlatformBadge name={game.platformShort} color={game.platformColor} />
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
            <span className={`h-1.5 w-1.5 ${padConnected ? 'bg-[#3ddc84]' : 'bg-white/25'}`} />
            {padConnected ? '手柄已连接' : '未检测到手柄 · 可用键盘'}
          </p>
        </div>
        {game?.romPacked && (
          <button
            onClick={repairAndRestart}
            disabled={repairBusy}
            title={t('game.repairHint')}
            className="flex h-8 items-center gap-1.5 border border-[#ffb020]/50 px-2 text-xs font-bold text-[#ffc857] transition-colors hover:border-[#ffb020] hover:bg-[#ffb020]/10 disabled:opacity-60"
          >
            {repairBusy ? <Spinner className="h-3.5 w-3.5" /> : <IconTool className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{t('game.repairRom')}</span>
            <span className="sm:hidden">{t('game.repairShort')}</span>
          </button>
        )}
        <button
          onClick={() => {
            setAttempt((a) => a + 1);
            setError('');
          }}
          className="flex h-8 items-center gap-1.5 border border-line px-2 text-xs font-bold text-white/60 transition-colors hover:border-cyan hover:text-cyan"
        >
          <IconSparkle className="h-3.5 w-3.5" /> 重启
        </button>
        {document.fullscreenEnabled && (
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="flex h-8 items-center gap-1.5 border border-line px-2 text-xs font-bold text-white/60 transition-colors hover:border-neon hover:text-neon"
          >
            <IconMonitor className="h-3.5 w-3.5" /> {t('play.fullscreen')}
          </button>
        )}
      </div>

      {/* 模拟器区域 */}
      <div className="flex flex-1 items-center justify-center px-0 py-0 sm:px-4 sm:py-4">
        <div className="relative w-full max-w-[1360px]">
          <div className="relative aspect-[4/3] w-full overflow-hidden border-2 border-line bg-black sm:aspect-video">
            <div ref={mountRef} className="h-full w-full" />

            {status === 'loading' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-[#08080e]">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center border-2 border-neon/60 text-neon">
                    <IconPlay className="ml-1 h-6 w-6" />
                  </div>
                  <span className="absolute -inset-2 animate-ping border border-neon/20" />
                </div>
                <div className="w-56">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-bold tracking-[0.2em] text-muted">
                    <span>{attempt > 0 ? `重新载入核心${autoRetryRef.current ? ` (${autoRetryRef.current}/2)` : ''}` : '载入模拟器'}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10">
                    <div
                      className="h-full bg-neon transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-white/30">{t('play.firstLoad')}</p>
              </div>
            )}

            {status === 'error' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#08080e] px-6 text-center">
                <p className="max-w-md text-sm leading-relaxed text-[#ff8fa8]">{error}</p>
                <div className="flex gap-2">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => {
                      setAttempt((a) => a + 1);
                      setError('');
                    }}
                  >
                    <Spinner className="h-3.5 w-3.5" /> 重试
                  </button>
                  <Link to={`/game/${id}`} className="btn btn-primary text-xs">
                    返回详情
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 快捷键说明 */}
      <div className="border-t-2 border-line bg-[#0d0d13] px-4 py-3">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted">
          <span className="flex items-center gap-1.5 font-bold text-white/60">
            <IconGamepad className="h-3.5 w-3.5 text-neon" /> 操作
          </span>
          <span>
            方向键 <kbd className="kbd">↑↓←→</kbd> 移动
          </span>
          <span>
            确认 <kbd className="kbd">Z</kbd> / 取消 <kbd className="kbd">X</kbd>
          </span>
          <span>
            菜单 <kbd className="kbd">Enter</kbd>
          </span>
          <span>
            全屏 <kbd className="kbd">Esc</kbd> 退出
          </span>
          <span className="text-white/35">
            · 游戏内菜单可重新映射按键、保存进度、调节画质
          </span>
        </div>
      </div>
    </div>
  );
}
