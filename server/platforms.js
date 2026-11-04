/**
 * 支持的游戏平台。
 * id 同时是 ROM 子目录名（data/roms/<id>），一律小写、与 short 对齐，玩家看目录就能对上平台。
 * emulatorCore 对应 EmulatorJS 的系统名（EJS_core），与 id 解耦：FC 的 EJS 系统名仍是 nes。
 * exts 用于上传校验，EmulatorJS 可直接读取 zip（内部同名 rom）。
 */
export const PLATFORMS = [
  {
    id: 'fc',
    name: 'FC / 红白机',
    short: 'FC',
    emulatorCore: 'nes',
    core: 'fceumm',
    color: '#e8453c',
    exts: ['.nes', '.unf', '.unif', '.zip'],
  },
  {
    id: 'sfc',
    name: 'SFC / 超任',
    short: 'SFC',
    emulatorCore: 'snes',
    core: 'snes9x',
    color: '#8f6fd6',
    exts: ['.sfc', '.smc', '.fig', '.zip'],
  },
  {
    id: 'gb',
    name: 'Game Boy',
    short: 'GB',
    emulatorCore: 'gb',
    core: 'gambatte',
    color: '#9bbc0f',
    exts: ['.gb', '.zip'],
  },
  {
    id: 'gbc',
    name: 'Game Boy Color',
    short: 'GBC',
    emulatorCore: 'gb',
    core: 'gambatte',
    color: '#e0b03a',
    exts: ['.gbc', '.zip'],
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    short: 'GBA',
    emulatorCore: 'gba',
    core: 'mgba',
    color: '#5b4bcd',
    exts: ['.gba', '.zip'],
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    short: 'N64',
    emulatorCore: 'n64',
    core: 'mupen64plus_next',
    color: '#3aa657',
    exts: ['.n64', '.z64', '.v64', '.zip'],
  },
  {
    id: 'md',
    name: 'MD / 世嘉五代',
    short: 'MD',
    emulatorCore: 'segaMD',
    core: 'genesis_plus_gx',
    color: '#2f7fd6',
    exts: ['.md', '.gen', '.smd', '.bin', '.zip'],
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    short: 'NDS',
    emulatorCore: 'nds',
    core: 'melonds',
    color: '#c94f7c',
    exts: ['.nds', '.zip'],
  },
  {
    id: 'arcade',
    name: 'Arcade / 街机',
    short: 'ARCADE',
    emulatorCore: 'arcade',
    core: 'fbneo',
    // FBNeo 内核清单里可选的其它核心（CPS1 / CPS2 专用旧版）
    cores: ['fbneo', 'fbalpha2012_cps1', 'fbalpha2012_cps2'],
    color: '#ff8a3d',
    // 街机 romset 本身就是 zip，EmulatorJS 不解压、直接交给内核，所以只收 zip
    exts: ['.zip'],
    // FBNeo 用压缩包文件名匹配 romset，上传名必须是 mslug.zip 这类短名
    romsetName: true,
    bios: '',
    hint: 'romset 需与 FBNeo 版本匹配；文件名必须是 romset 短名（如 mslug.zip），不要改名或解压',
  },
  {
    id: 'neogeo',
    name: 'NEOGEO / 街机',
    short: 'NEOGEO',
    emulatorCore: 'arcade',
    core: 'fbneo',
    cores: ['fbneo'],
    color: '#f5c518',
    exts: ['.zip'],
    romsetName: true,
    // 需要 neogeo.zip 作为 BIOS，缺了会黑屏
    bios: 'neogeo.zip',
    hint: '必须先上传 BIOS（neogeo.zip）；ROM 文件名需为 romset 短名（如 mslug.zip）',
  },
];

export const PLATFORM_MAP = new Map(PLATFORMS.map((p) => [p.id, p]));

/**
 * 历史平台 id → 现行 id。
 * 早期版本平台 id 用 EmulatorJS 系统名（nes/snes），后来统一为显示简称（fc/sfc）。
 * 老库里的 games.platform、series.platform、平台权重、素材槽、文案 key 以及磁盘上的 ROM 目录都需要据此迁移。
 */
export const LEGACY_PLATFORM_IDS = { nes: 'fc', snes: 'sfc' };

export const ROM_EXTS = new Set(PLATFORMS.flatMap((p) => p.exts));

/** 扩展名 → 平台 id（同一后缀对应多个平台时取先出现的那个） */
const EXT_PLATFORM = (() => {
  const map = new Map();
  for (const p of PLATFORMS) {
    for (const ext of p.exts) {
      if (ext === '.zip') continue; // zip 无法判断，单独处理
      if (!map.has(ext)) map.set(ext, p.id);
    }
  }
  return map;
})();

/**
 * 按扩展名猜平台，用于「管理员只上传了 ROM、没填平台」的场景。
 * zip 一律当作街机（FBNeo 的 romset 就是 zip）。
 */
export function guessPlatform(fileName) {
  const ext = String(fileName || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
  if (!ext) return null;
  return EXT_PLATFORM.get(ext) || (ext === '.zip' ? 'arcade' : null);
}

export function getPlatform(id) {
  return PLATFORM_MAP.get(id) || null;
}

/** 原始标题 → 稳定的对比值，用于查重提示 */
export function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\-_:：·.,，。'"!?！？()（）\[\]]/g, '');
}
