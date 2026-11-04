export type User = {
  id: number;
  username: string;
  role: 'admin' | 'user';
  createdAt?: string;
};

export type Platform = {
  id: string;
  name: string;
  short: string;
  core: string;
  cores?: string[];
  color: string;
  exts: string[];
  bios?: string;
  hint?: string;
  count?: number;
  /** 排序权重：越大越靠前 */
  weight?: number;
};

export type Game = {
  id: number;
  title: string;
  platform: string;
  platformName: string;
  platformShort: string;
  platformColor: string;
  emulatorCore: string;
  description: string;
  cover: string;
  year: number | null;
  developer: string;
  publisher: string;
  genre: string;
  players: number;
  playCount: number;
  featured: boolean;
  /** 排序权重：越大越靠前 */
  weight: number;
  hasRom: boolean;
  /** 曾登记过 ROM，但文件已不在磁盘（放回后扫描即可恢复） */
  romMissing: boolean;
  romName: string;
  romSize: number;
  romUrl: string;
  core: string;
  biosName: string;
  needsBios: boolean;
  favCount: number;
  isFavorite: boolean;
  /** 所属系列 ID；null = 不属于任何系列 */
  seriesId: number | null;
  seriesName: string;
  createdAt: string;
  updatedAt: string;
  favoritedAt?: string;
  playedAt?: string;
};

/** 游戏系列：管理员维护，含封面/名称/简介/类型/平台/权重 */
export type Series = {
  id: number;
  name: string;
  cover: string;
  description: string;
  genre: string;
  /** 所属平台；空 = 不限平台 */
  platform: string;
  /** 平台简称（如 FC、NEOGEO） */
  platformShort: string;
  /** 平台颜色 */
  platformColor: string;
  weight: number;
  /** 是否设为首页精选 */
  featured: boolean;
  gameCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type HomeSection = {
  id: string;
  name: string;
  short: string;
  color: string;
  count: number;
  items: Game[];
};

export type HomePlatform = {
  id: string;
  short: string;
  color: string;
  count: number;
};

export type HomeData = {
  platforms: HomePlatform[];
  sections: HomeSection[];
  latest: Game[];
  series: Series[];
  featuredGames: Game[];
  featuredSeries: Series[];
  total: number;
};

export type TextField = {
  key: string;
  label: string;
  multiline?: boolean;
  max?: number;
};

export type TextGroup = {
  label: string;
  fields: TextField[];
};

export type AdminTextsData = {
  locales: { id: string; label: string; short: string; htmlLang: string }[];
  defaultLocale: string;
  groups: TextGroup[];
  values: Record<string, Record<string, string>>;
  overridden: Record<string, string[]>;
  defaults: Record<string, Record<string, string>>;
};

export type AssetSlot = {
  key: string;
  label: string;
  group: string;
  ratio: string;
  hint: string;
  /** 预览地址：自定义优先，没有自定义时是内置默认图 */
  url: string;
  /** 后台上传的地址，空串表示未自定义 */
  custom?: string;
  /** 当前展示的是项目内置默认图 */
  isDefault?: boolean;
  /** 该槽位是否自带默认图（清空后能回退） */
  hasDefault?: boolean;
  updatedAt: string;
};

export type AdminStats = {
  games: number;
  plays: number;
  missingRom: number;
  users: number;
  favorites: number;
  byPlatform: { platform: string; name: string; count: number }[];
};

export type AdminUser = {
  id: number;
  username: string;
  role: string;
  createdAt: string;
  favCount: number;
  playCount: number;
};
