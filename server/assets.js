import { PLATFORMS, PLATFORM_MAP } from './platforms.js';

/**
 * 站点静态图片槽位。key 固定，前端按 key 取图，后台按 key 上传替换。
 * 没有上传的槽位，前端会走内置的渐变/像素占位，不会出现破图。
 */
const BASE_SLOTS = [
  {
    key: 'hero_banner',
    label: '首页主横幅',
    group: '首页',
    ratio: '1920 × 720',
    hint: '首页顶部背景大图，建议深色背景 + 中央留白，文字会叠在中间',
  },
  {
    key: 'site_logo',
    label: '站点标识',
    group: '通用',
    ratio: '240 × 64',
    hint: '留空则显示文字 LOGO；透明 PNG 最佳',
  },
  {
    key: 'og_image',
    label: '分享封面',
    group: '通用',
    ratio: '1200 × 630',
    hint: '分享到微信/微博等平台时的预览图',
  },
  {
    key: 'empty_state',
    label: '空状态插画',
    group: '通用',
    ratio: '600 × 600',
    hint: '没有游戏 / 搜索无结果时展示的像素插画',
  },
  {
    key: 'game_placeholder',
    label: '游戏封面占位图',
    group: '通用',
    ratio: '600 × 836',
    hint: '游戏没有上传封面时使用；留空则用平台配色像素图',
  },
  {
    key: 'section_more',
    label: '分区「查看更多」插图',
    group: '通用',
    ratio: '400 × 300',
    hint: '可选，留空则只显示文字按钮',
  },
];

const PLATFORM_SLOTS = PLATFORMS.map((p) => ({
  key: `platform_${p.id}`,
  label: `${p.name} 平台图`,
  group: '平台分区',
  ratio: '640 × 400',
  hint: '首页平台卡片的头图（16:10 最佳），留空则显示平台配色的像素方块',
}));

export const ASSET_SLOTS = [...BASE_SLOTS, ...PLATFORM_SLOTS];
export const ASSET_KEYS = new Set(ASSET_SLOTS.map((s) => s.key));
export const SLOT_MAP = new Map(ASSET_SLOTS.map((s) => [s.key, s]));

/** 首页分区顺序：按 PLATFORMS 定义顺序展示，只有存在游戏的平台才会出现在首页 */
export const HOME_SECTIONS = PLATFORMS.map((p) => ({
  id: p.id,
  name: p.name,
  short: p.short,
  color: p.color,
  assetKey: `platform_${p.id}`,
  exists: PLATFORM_MAP.has(p.id),
}));
