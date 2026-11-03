/**
 * 站点展示文案。
 *
 * 设计要点：
 * - 只有「展示文案」进这里（Banner、分区标题、平台介绍、页脚等）；
 *   系统级文字（错误提示、日期格式、按钮状态）走前端内置语言包。
 * - 每个 key 都内置 6 种语言的默认值，管理员可在后台按语言覆盖。
 * - 取值顺序：后台覆盖(当前语言) → 内置(当前语言) → 后台覆盖(中文) → 内置(中文) → ''。
 *   也就是某种语言完全没配时，回退中文。
 */
import { PLATFORMS } from './platforms.js';

export const LOCALES = [
  { id: 'zh', label: '简体中文', short: '简', htmlLang: 'zh-CN' },
  { id: 'zh-Hant', label: '繁體中文', short: '繁', htmlLang: 'zh-Hant' },
  { id: 'en', label: 'English', short: 'EN', htmlLang: 'en' },
  { id: 'ja', label: '日本語', short: '日', htmlLang: 'ja' },
  { id: 'ko', label: '한국어', short: '한', htmlLang: 'ko' },
  { id: 'ru', label: 'Русский', short: 'RU', htmlLang: 'ru' },
];

export const LOCALE_IDS = LOCALES.map((l) => l.id);
export const DEFAULT_LOCALE = 'zh';

/** 同一个值喂给所有语言；传对象则按语言取，缺省回落 zh */
function loc(value) {
  if (typeof value === 'string') {
    return Object.fromEntries(LOCALE_IDS.map((id) => [id, value]));
  }
  return Object.fromEntries(LOCALE_IDS.map((id) => [id, value[id] ?? value.zh ?? '']));
}

/* ----------------------------- 通用文案 ----------------------------- */

const BASE = {
  'brand.name': loc('ABXY ARCADE'),
  'brand.sub': loc('ARCADE'),

  'hero.badge': loc('RETRO GAME STATION'),
  'hero.title': loc({ zh: 'ABXY ARCADE', 'zh-Hant': 'ABXY ARCADE' }),
  'hero.subtitle': loc({
    zh: '把童年插回卡带槽。浏览器里直接开玩，插上手柄，就是当年那台机器。',
    'zh-Hant': '把童年插回卡帶槽。瀏覽器裡直接開玩，插上手把，就是當年那台機器。',
    en: 'Slide the cartridge back in. Play right in your browser — grab a controller and it is 1993 again.',
    ja: 'カセットを差し込み直そう。ブラウザでそのまま遊べて、パッドを握ればあの頃のまま。',
    ko: '카트리지를 다시 꽂으세요. 브라우저에서 바로 즐기고, 패드를 잡으면 그 시절 그대로.',
    ru: 'Вставьте картридж обратно. Играйте прямо в браузере — с геймпадом всё как тогда.',
  }),
  'hero.meta': loc({
    zh: '支持手柄 · 即时存档 · 免安装',
    'zh-Hant': '支援手把 · 即時存檔 · 免安裝',
    en: 'Gamepad ready · Save states · No install',
    ja: 'パッド対応 · セーブステート · インストール不要',
    ko: '패드 지원 · 세이브 스테이트 · 설치 불필요',
    ru: 'Геймпад · Сохранения · Без установки',
  }),

  'home.platforms.title': loc({
    zh: '游戏平台',
    'zh-Hant': '遊戲平台',
    en: 'Platforms',
    ja: 'ゲーム機',
    ko: '게임기',
    ru: 'Платформы',
  }),
  'home.platforms.desc': loc({
    zh: '选一台机器，回到那个年代',
    'zh-Hant': '選一台機器，回到那個年代',
    en: 'Pick a machine, go back in time',
    ja: '一台を選んで、あの時代へ',
    ko: '기기를 골라 그 시절로',
    ru: 'Выберите машину — и в прошлое',
  }),
  'home.featured.title': loc({
    zh: '精选推荐',
    'zh-Hant': '精選推薦',
    en: 'Featured',
    ja: 'ピックアップ',
    ko: '추천 게임',
    ru: 'Избранное',
  }),
  'home.featured.desc': loc({
    zh: '编辑手工挑选',
    'zh-Hant': '編輯手工挑選',
    en: 'Hand-picked by the editor',
    ja: '編集部のセレクト',
    ko: '에디터 추천',
    ru: 'Выбор редакции',
  }),
  'home.viewAll': loc({
    zh: '查看全部',
    'zh-Hant': '查看全部',
    en: 'View all',
    ja: 'すべて見る',
    ko: '전체 보기',
    ru: 'Все',
  }),

  'empty.library.title': loc({
    zh: '游戏库还是空的',
    'zh-Hant': '遊戲庫還是空的',
    en: 'The library is empty',
    ja: 'ライブラリはまだ空です',
    ko: '게임이 아직 없습니다',
    ru: 'Библиотека пока пуста',
  }),
  'empty.library.desc': loc({
    zh: '管理员还没有上架游戏，晚点再来看看吧。',
    'zh-Hant': '管理員還沒有上架遊戲，晚點再來看看吧。',
    en: 'No games have been published yet. Check back soon.',
    ja: 'まだゲームが公開されていません。少し後でのぞいてみてください。',
    ko: '아직 등록된 게임이 없습니다. 잠시 후 다시 확인해 주세요.',
    ru: 'Игры ещё не опубликованы. Загляните позже.',
  }),
  'empty.search.title': loc({
    zh: '没有找到相关游戏',
    'zh-Hant': '沒有找到相關遊戲',
    en: 'No games found',
    ja: 'ゲームが見つかりません',
    ko: '게임을 찾지 못했습니다',
    ru: 'Игры не найдены',
  }),
  'empty.search.desc': loc({
    zh: '换个关键词试试，或去其他平台分类里逛逛。',
    'zh-Hant': '換個關鍵字試試，或去其他平台分類裡逛逛。',
    en: 'Try another keyword, or browse by platform.',
    ja: '別のキーワードで試すか、機種から探してみてください。',
    ko: '다른 검색어를 입력하거나 기기별로 둘러보세요.',
    ru: 'Попробуйте другой запрос или выберите платформу.',
  }),

  'footer.about': loc({
    zh: '用像素致敬童年。收录 FC / SFC / GBA / 街机 等经典平台，浏览器直接开玩，支持手柄与即时存档。',
    'zh-Hant': '用像素致敬童年。收錄 FC / SFC / GBA / 街機 等經典平台，瀏覽器直接開玩，支援手把與即時存檔。',
    en: 'A pixel tribute to childhood. Classic FC / SFC / GBA / arcade titles, playable in the browser with gamepad and save states.',
    ja: 'ピクセルで子ども時代に敬意を。FC / SFC / GBA / アーケードなどの名作をブラウザで直接、パッドとセーブステートにも対応。',
    ko: '픽셀로 그 시절을 기억합니다. FC / SFC / GBA / 아케이드 명작을 브라우저에서 바로, 패드와 세이브 스테이트 지원.',
    ru: 'Пиксельная дань детству. Классика FC / SFC / GBA / аркад прямо в браузере, с геймпадом и сохранениями.',
  }),
  'footer.browse': loc({
    zh: '浏览',
    'zh-Hant': '瀏覽',
    en: 'Browse',
    ja: 'メニュー',
    ko: '둘러보기',
    ru: 'Разделы',
  }),
  'footer.note': loc({
    zh: '说明',
    'zh-Hant': '說明',
    en: 'Notice',
    ja: 'ご注意',
    ko: '안내',
    ru: 'Правовая информация',
  }),
  'footer.disclaimer': loc({
    zh: '本站不内置任何游戏文件，仅上传你拥有合法权利的内容。游戏版权归各自权利人所有。',
    'zh-Hant': '本站不內建任何遊戲檔案，僅上傳你擁有合法權利的内容。遊戲版權歸各自權利人所有。',
    en: 'This site ships no game files. Only upload content you have the rights to. All game copyrights belong to their respective owners.',
    ja: '当サイトはゲームファイルを内蔵していません。権利を有する内容のみアップロードしてください。',
    ko: '본 사이트는 게임 파일을 포함하지 않습니다. 권리가 있는 콘텐츠만 업로드하세요.',
    ru: 'Сайт не содержит игровых файлов. Загружайте только тот контент, на который у вас есть права.',
  }),
  'footer.copyright': loc('© {year} ABXY ARCADE · Powered by Express + EmulatorJS'),
};

/* ----------------------------- 平台卡片 ----------------------------- */

/** 平台卡片默认文案：名称 / 副名 / 简介 / 年份 / 厂商类型 */
const PLATFORM_DEFAULTS = {
  nes: {
    name: loc('FC'),
    sub: loc('FAMILY COMPUTER'),
    year: '1983',
    vendor: loc({ zh: 'Nintendo / 家用机', 'zh-Hant': 'Nintendo / 家用機', en: 'Nintendo / Console', ja: '任天堂 / 据置機', ko: '닌텐도 / 가정용', ru: 'Nintendo / Консоль' }),
    desc: loc({
      zh: '8 位机的起点，红白机时代的一切从这里开始。',
      'zh-Hant': '8 位元的起點，紅白機時代的一切從這裡開始。',
      en: 'Where 8-bit began. Everything about the Famicom era starts here.',
      ja: '8 ビットの原点。ファミコン時代のすべてはここから始まった。',
      ko: '8비트의 시작. 패미컴 시대의 모든 것이 여기서 출발했습니다.',
      ru: 'Начало 8-битной эпохи. Здесь начинается всё.',
    }),
  },
  snes: {
    name: loc('SFC'),
    sub: loc('SUPER FAMICOM'),
    year: '1990',
    vendor: loc({ zh: 'Nintendo / 家用机', 'zh-Hant': 'Nintendo / 家用機', en: 'Nintendo / Console', ja: '任天堂 / 据置機', ko: '닌텐도 / 가정용', ru: 'Nintendo / Консоль' }),
    desc: loc({
      zh: '16 位巅峰，色彩与音源的第一次飞跃。',
      'zh-Hant': '16 位元巔峰，色彩與音源的第一飛躍。',
      en: 'The 16-bit peak — the first great leap in color and sound.',
      ja: '16 ビットの頂点。色彩と音源の最初の飛躍。',
      ko: '16비트의 정점. 색과 사운드의 첫 도약.',
      ru: 'Пик 16-бит: первый большой скачок цвета и звука.',
    }),
  },
  gb: {
    name: loc('GB'),
    sub: loc('GAME BOY'),
    year: '1989',
    vendor: loc({ zh: 'Nintendo / 掌机', 'zh-Hant': 'Nintendo / 掌機', en: 'Nintendo / Handheld', ja: '任天堂 / 携帯機', ko: '닌텐도 / 휴대용', ru: 'Nintendo / Портативная' }),
    desc: loc({
      zh: '绿色单色屏，装进口袋的整个童年。',
      'zh-Hant': '綠色單色螢幕，裝進口袋的整個童年。',
      en: 'A green monochrome screen with a whole childhood inside.',
      ja: '緑の単色画面に、子ども時代まるごとをポケットへ。',
      ko: '초록 단색 화면에 어린 시절을 통째로 담아 주머니에.',
      ru: 'Зелёный монохромный экран — целое детство в кармане.',
    }),
  },
  gbc: {
    name: loc('GBC'),
    sub: loc('GAME BOY COLOR'),
    year: '1998',
    vendor: loc({ zh: 'Nintendo / 掌机', 'zh-Hant': 'Nintendo / 掌機', en: 'Nintendo / Handheld', ja: '任天堂 / 携帯機', ko: '닌텐도 / 휴대용', ru: 'Nintendo / Портативная' }),
    desc: loc({
      zh: '掌机终于有了颜色，电池也更耐玩。',
      'zh-Hant': '掌機終於有了顏色，電池也更耐玩。',
      en: 'Handheld finally got color — and batteries lasted longer.',
      ja: '携帯機にようやく色がつき、電池も長持ちに。',
      ko: '휴대기에 마침내 색이 입혀지고 배터리도 더 오래.',
      ru: 'У портативной консоли появился цвет — и батарейки.',
    }),
  },
  gba: {
    name: loc('GBA'),
    sub: loc('GAME BOY ADVANCE'),
    year: '2001',
    vendor: loc({ zh: 'Nintendo / 掌机', 'zh-Hant': 'Nintendo / 掌機', en: 'Nintendo / Handheld', ja: '任天堂 / 携帯機', ko: '닌텐도 / 휴대용', ru: 'Nintendo / Портативная' }),
    desc: loc({
      zh: '32 位掌机，2D 像素艺术的最后黄金期。',
      'zh-Hant': '32 位元掌機，2D 像素藝術的最後黃金期。',
      en: '32-bit handheld, the last golden age of 2D pixel art.',
      ja: '32 ビット携帯機。2D ピクセルアート最後の黄金期。',
      ko: '32비트 휴대기, 2D 픽셀 아트의 마지막 황금기.',
      ru: '32-битная портативная консоль и последний расцвет 2D-пикселя.',
    }),
  },
  n64: {
    name: loc('N64'),
    sub: loc('NINTENDO 64'),
    year: '1996',
    vendor: loc({ zh: 'Nintendo / 家用机', 'zh-Hant': 'Nintendo / 家用機', en: 'Nintendo / Console', ja: '任天堂 / 据置機', ko: '닌텐도 / 가정용', ru: 'Nintendo / Консоль' }),
    desc: loc({
      zh: '从 2D 跨进 3D，四人对战的客厅记忆。',
      'zh-Hant': '從 2D 跨進 3D，四人對戰的客廳記憶。',
      en: 'The jump from 2D to 3D, and four-player nights in the living room.',
      ja: '2D から 3D へ。四人対戦のリビングの記憶。',
      ko: '2D에서 3D로, 4인 대전의 거실 기억.',
      ru: 'Прыжок из 2D в 3D и вечера на четверых в гостиной.',
    }),
  },
  md: {
    name: loc('MD'),
    sub: loc('MEGA DRIVE'),
    year: '1988',
    vendor: loc({ zh: 'SEGA / 家用机', 'zh-Hant': 'SEGA / 家用機', en: 'SEGA / Console', ja: 'SEGA / 据置機', ko: 'SEGA / 가정용', ru: 'SEGA / Консоль' }),
    desc: loc({
      zh: '16 位硬派作风，把街机厅搬进了客厅。',
      'zh-Hant': '16 位元硬派作風，把街機廳搬進了客廳。',
      en: '16-bit attitude that dragged the arcade into your living room.',
      ja: '16 ビットの硬派な作風。ゲーセンを居間に持ち込んだ。',
      ko: '16비트의 하드보일드, 오락실을 거실로 옮기다.',
      ru: 'Жёсткий 16-битный характер — аркада переехала в гостиную.',
    }),
  },
  nds: {
    name: loc('NDS'),
    sub: loc('NINTENDO DS'),
    year: '2004',
    vendor: loc({ zh: 'Nintendo / 掌机', 'zh-Hant': 'Nintendo / 掌機', en: 'Nintendo / Handheld', ja: '任天堂 / 携帯機', ko: '닌텐도 / 휴대용', ru: 'Nintendo / Портативная' }),
    desc: loc({
      zh: '双屏加触控，玩法被重新发明了一遍。',
      'zh-Hant': '雙螢幕加觸控，玩法被重新發明了一遍。',
      en: 'Two screens and a stylus — gameplay got reinvented.',
      ja: '二画面とタッチで、遊びがもう一度発明された。',
      ko: '듀얼 스크린과 터치로 놀이가 다시 발명되다.',
      ru: 'Два экрана и стилус — геймплей изобрели заново.',
    }),
  },
  arcade: {
    name: loc({ zh: '街机', 'zh-Hant': '街機', en: 'Arcade', ja: 'アーケード', ko: '아케이드', ru: 'Аркада' }),
    sub: loc('COIN-OP'),
    year: '1978',
    vendor: loc({ zh: 'Various / 街机', 'zh-Hant': 'Various / 街機', en: 'Various / Arcade', ja: '各社 / アーケード', ko: '다수 / 아케이드', ru: 'Разные / Аркада' }),
    desc: loc({
      zh: '投币、摇杆、连击，街机厅的黄金年代。',
      'zh-Hant': '投幣、搖桿、連擊，街機廳的黃金年代。',
      en: 'Coins, joysticks, combos — the golden age of the arcade hall.',
      ja: 'コイン、レバー、コンボ。ゲーセンの黄金時代。',
      ko: '동전, 조이스틱, 콤보. 오락실의 황금기.',
      ru: 'Монеты, джойстик, комбо — золотой век аркадных залов.',
    }),
  },
  neogeo: {
    name: loc('NEO GEO'),
    sub: loc('SNK ARCADE'),
    year: '1990',
    vendor: loc({ zh: 'SNK / 街机', 'zh-Hant': 'SNK / 街機', en: 'SNK / Arcade', ja: 'SNK / アーケード', ko: 'SNK / 아케이드', ru: 'SNK / Аркада' }),
    desc: loc({
      zh: 'SNK 的机皇，拳皇与合金弹头的家。',
      'zh-Hant': 'SNK 的機皇，拳皇與合金彈頭的家。',
      en: "SNK's flagship — home of KOF and Metal Slug.",
      ja: 'SNK の旗艦機。KOF とメタルスラッグの家。',
      ko: 'SNK의 기함, KOF와 메탈슬러그의 집.',
      ru: 'Флагман SNK — дом KOF и Metal Slug.',
    }),
  },
};

/** 拼接成扁平的 key → 各语言默认值 */
const PLATFORM_TEXT = {};
for (const p of PLATFORMS) {
  const meta = PLATFORM_DEFAULTS[p.id];
  PLATFORM_TEXT[`platform.${p.id}.name`] = meta.name;
  PLATFORM_TEXT[`platform.${p.id}.sub`] = meta.sub;
  PLATFORM_TEXT[`platform.${p.id}.desc`] = meta.desc;
  PLATFORM_TEXT[`platform.${p.id}.year`] = loc(meta.year);
  PLATFORM_TEXT[`platform.${p.id}.vendor`] = meta.vendor;
}

export const TEXT_DEFAULTS = { ...BASE, ...PLATFORM_TEXT };

/** 后台表单分组：group 标题 + 每个 key 的中文标注 */
const BASE_FIELDS = [
  { key: 'brand.name', label: '站点名称', group: '品牌' },
  { key: 'brand.sub', label: '站点副名', group: '品牌' },
  { key: 'hero.badge', label: 'Banner 小标签', group: '首页 Banner' },
  { key: 'hero.title', label: 'Banner 主标题', group: '首页 Banner' },
  { key: 'hero.subtitle', label: 'Banner 副标题', group: '首页 Banner', multiline: true, max: 220 },
  { key: 'hero.meta', label: 'Banner 底部说明', group: '首页 Banner' },
  { key: 'home.platforms.title', label: '平台分区标题', group: '首页分区' },
  { key: 'home.platforms.desc', label: '平台分区副标题', group: '首页分区' },
  { key: 'home.featured.title', label: '精选区标题', group: '首页分区' },
  { key: 'home.featured.desc', label: '精选区副标题', group: '首页分区' },
  { key: 'home.viewAll', label: '「查看全部」按钮', group: '首页分区' },
  { key: 'empty.library.title', label: '空库标题', group: '空状态' },
  { key: 'empty.library.desc', label: '空库说明', group: '空状态', multiline: true },
  { key: 'empty.search.title', label: '搜索无结果标题', group: '空状态' },
  { key: 'empty.search.desc', label: '搜索无结果说明', group: '空状态', multiline: true },
  { key: 'footer.about', label: '页脚简介', group: '页脚', multiline: true, max: 260 },
  { key: 'footer.note', label: '页脚说明标题', group: '页脚' },
  { key: 'footer.disclaimer', label: '页脚版权声明', group: '页脚', multiline: true, max: 300 },
  { key: 'footer.copyright', label: '页脚版权行（{year} 自动替换为年份）', group: '页脚', max: 160 },
];

const PLATFORM_FIELDS = PLATFORMS.flatMap((p) => [
  { key: `platform.${p.id}.name`, label: `${p.name} · 卡片名称`, group: `平台卡片 · ${p.name}`, max: 40 },
  { key: `platform.${p.id}.sub`, label: `${p.name} · 副名`, group: `平台卡片 · ${p.name}`, max: 40 },
  { key: `platform.${p.id}.desc`, label: `${p.name} · 简介`, group: `平台卡片 · ${p.name}`, multiline: true, max: 160 },
  { key: `platform.${p.id}.year`, label: `${p.name} · 年份`, group: `平台卡片 · ${p.name}`, max: 12 },
  { key: `platform.${p.id}.vendor`, label: `${p.name} · 厂商 / 类型`, group: `平台卡片 · ${p.name}`, max: 40 },
]);

export const TEXT_FIELDS = [...BASE_FIELDS, ...PLATFORM_FIELDS];
export const TEXT_KEY_SET = new Set(TEXT_FIELDS.map((f) => f.key));

/** 后台展示用分组结构（保持定义顺序） */
export function textGroups() {
  const map = new Map();
  for (const f of TEXT_FIELDS) {
    if (!map.has(f.group)) map.set(f.group, []);
    map.get(f.group).push({ key: f.key, label: f.label, multiline: !!f.multiline, max: f.max || 120 });
  }
  return [...map.entries()].map(([label, fields]) => ({ label, fields }));
}

export function isLocale(id) {
  return LOCALE_IDS.includes(id);
}

function defaultsFor(locale) {
  const out = {};
  for (const [key, byLocale] of Object.entries(TEXT_DEFAULTS)) {
    out[key] = byLocale[locale] ?? byLocale[DEFAULT_LOCALE] ?? '';
  }
  return out;
}

/**
 * 合并某个语言的最终文案。
 * rows: site_texts 中该语言 + 中文的覆盖记录
 */
export function mergeTexts(locale, rowsForLocale, rowsForZh) {
  const out = defaultsFor(locale);
  const zhDefaults = locale === DEFAULT_LOCALE ? out : defaultsFor(DEFAULT_LOCALE);

  for (const key of Object.keys(out)) {
    const own = rowsForLocale.get(key);
    if (own) {
      out[key] = own;
      continue;
    }
    // 当前语言没有后台配置时：先用内置翻译，再退回中文（后台覆盖 → 内置）
    if (!out[key]) out[key] = rowsForZh.get(key) || zhDefaults[key] || '';
    else if (locale !== DEFAULT_LOCALE && !TEXT_DEFAULTS[key]?.[locale]) {
      out[key] = rowsForZh.get(key) || out[key];
    }
  }
  return out;
}

export { defaultsFor };
