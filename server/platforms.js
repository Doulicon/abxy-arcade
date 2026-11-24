/**
 * 支持的游戏平台。
 * id 同时是 ROM 子目录名（data/roms/<id>），一律小写、与 short 对齐，玩家看目录就能对上平台。
 * emulatorCore 对应 EmulatorJS 的系统名（EJS_core），与 id 解耦：FC 的 EJS 系统名仍是 nes。
 * exts 用于上传校验，EmulatorJS 可直接读取 zip（内部同名 rom）。
 */
/**
 * 数组顺序 = 首页平台卡片、后台下拉的默认顺序（后台按权重调整时会覆盖）。
 * 想改默认顺位就调这里的先后，不要在别处再写一套顺序。
 */
export const PLATFORMS = [
  // 1
  {
    id: 'fc',
    name: 'FC / 红白机',
    short: 'FC',
    emulatorCore: 'nes',
    core: 'fceumm',
    color: '#e8453c',
    exts: ['.nes', '.unf', '.unif', '.zip'],
  },
  // 2
  {
    id: 'neogeo',
    name: 'NEOGEO / 街机',
    short: 'NEOGEO',
    emulatorCore: 'arcade',
    core: 'fbneo',
    cores: ['fbneo'],
    color: '#f5c518',
    // 注意：不能加 .7z。FBNeo 的 Emscripten 构建把 7z 支持编译掉了，
    // 喂 .7z 会直接报「7z archive support is disabled for your platform」。
    // 街机 romset 必须是 .zip，改版 7z 需先用 7z a 重新打包成 zip。
    exts: ['.zip'],
    romsetName: true,
    // 需要 neogeo.zip 作为 BIOS，缺了会黑屏
    bios: 'neogeo.zip',
    hint: '必须先上传 BIOS（neogeo.zip）；ROM 文件名需为 romset 短名（如 mslug.zip）',
  },
  // 3
  {
    id: 'gba',
    name: 'Game Boy Advance',
    short: 'GBA',
    emulatorCore: 'gba',
    core: 'mgba',
    color: '#5b4bcd',
    exts: ['.gba', '.zip'],
  },
  // 4
  {
    id: 'sfc',
    name: 'SFC / 超任',
    short: 'SFC',
    emulatorCore: 'snes',
    core: 'snes9x',
    color: '#8f6fd6',
    exts: ['.sfc', '.smc', '.fig', '.zip'],
  },
  // 5
  {
    id: 'gbc',
    name: 'Game Boy Color',
    short: 'GBC',
    emulatorCore: 'gb',
    core: 'gambatte',
    color: '#e0b03a',
    exts: ['.gbc', '.zip'],
  },
  // 6
  {
    id: 'n64',
    name: 'Nintendo 64',
    short: 'N64',
    emulatorCore: 'n64',
    core: 'mupen64plus_next',
    color: '#3aa657',
    exts: ['.n64', '.z64', '.v64', '.zip'],
  },
  // 7
  {
    id: 'md',
    name: 'MD / 世嘉五代',
    short: 'MD',
    emulatorCore: 'segaMD',
    core: 'genesis_plus_gx',
    color: '#2f7fd6',
    exts: ['.md', '.gen', '.smd', '.bin', '.zip'],
  },
  // 8
  {
    id: 'nds',
    name: 'Nintendo DS',
    short: 'NDS',
    emulatorCore: 'nds',
    core: 'melonds',
    color: '#c94f7c',
    // .7z 是 NDS 合集最常见的打包方式；EmulatorJS 按文件头魔数识别压缩格式
    // （37 7A BC AF 27 1C），自带 extract7z worker，浏览器端能直接解，无需服务端处理
    exts: ['.nds', '.7z', '.zip'],
  },
  // 9
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
  // 10
  {
    id: 'gb',
    name: 'Game Boy',
    short: 'GB',
    emulatorCore: 'gb',
    core: 'gambatte',
    color: '#9bbc0f',
    exts: ['.gb', '.zip'],
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

/**
 * 压缩包后缀：同一个后缀可能属于多个平台（NDS 可以是 .7z 也可以是 .zip，
 * 街机只收 .zip），无法据此判断平台，猜平台时一律跳过。
 */
const ARCHIVE_EXTS = new Set(['.zip', '.7z', '.rar']);

/** 扩展名 → 平台 id（同一后缀对应多个平台时取先出现的那个） */
const EXT_PLATFORM = (() => {
  const map = new Map();
  for (const p of PLATFORMS) {
    for (const ext of p.exts) {
      if (ARCHIVE_EXTS.has(ext)) continue; // 压缩包无法判断平台，单独处理
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

/**
 * 严格按扩展名猜平台：zip 无法判断时返回 null。
 * 批量扫描用这个，避免把一整柜 FC 的 zip 全塞进街机。
 */
export function guessPlatformStrict(fileName) {
  const ext = String(fileName || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
  if (!ext) return null;
  return EXT_PLATFORM.get(ext) || null;
}

/**
 * 目录名 → 平台 id。
 * 玩家的 ROM 往往是「FC中文游戏全集」「SFC游戏合集」「GBA」这种中文/大写目录，
 * 不会自己改成 fc/ sfc/。这里按别名猜一次，猜中就把里面的文件归到该平台。
 */
const NAME_ALIASES = (() => {
  const raw = {
    fc: ['fc', 'nes', 'famicom', '红白机', '任天堂', '小霸王', '8位机'],
    sfc: ['sfc', 'snes', 'superfamicom', 'supernintendo', '超任', '超级任天堂', '16位机'],
    gba: ['gba', 'gameboyadvance'],
    gbc: ['gbc', 'gameboycolor', 'gbcolor', '彩机'],
    gb: ['gb', 'gameboy', '砖头机'],
    n64: ['n64', 'nintendo64', '神游机'],
    md: ['md', 'megadrive', 'genesis', 'sega', '世嘉', '五代机'],
    nds: ['nds', 'nintendods', '双屏机'],
    neogeo: ['neogeo', 'neogeoaes', 'neogeomvs'],
    arcade: ['arcade', 'mame', 'fbneo', 'fba', 'cps1', 'cps2', 'cps3', '街机', '基板'],
  };
  return Object.entries(raw)
    .flatMap(([id, list]) => list.map((alias) => [alias.replace(/[^a-z0-9\u4e00-\u9fa5]/g, ''), id]))
    .filter(([alias]) => alias)
    .sort((a, b) => b[0].length - a[0].length); // 长别名优先：sfc 先于 fc，gbc 先于 gb
})();

export function guessPlatformFromName(name) {
  const key = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  if (!key) return null;
  const hit = NAME_ALIASES.find(([alias]) => key.includes(alias));
  return hit ? hit[1] : null;
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
