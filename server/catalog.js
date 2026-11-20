import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 街机 ROM 中文目录
 * ---------------------------------------------------------------
 * 街机 romset 只能叫 mslug.zip / kof98.zip 这种固定短名，玩家在前端
 * 看到一串英文短名完全不知道是什么游戏。这里内置一份「romset 短名 →
 * 中文名 + 简介」的对照表（来自 EmulationStation 的 gamelist 元数据），
 * 上传或扫描到对应文件时自动套用，用户自己填过的信息不覆盖。
 *
 * 数据文件：server/arcade-catalog.json（1286 条，文件名去掉扩展名、小写作键）
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_FILE = path.join(HERE, 'arcade-catalog.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    cache = raw && typeof raw.games === 'object' && raw.games ? raw.games : {};
  } catch (err) {
    console.warn('  ! 街机中文目录读取失败，将按文件名显示:', err.message);
    cache = {};
  }
  return cache;
}

/** 文件名 → romset 键（去扩展名、转小写） */
export function romsetKey(fileName) {
  const base = path.basename(String(fileName || '').replace(/\\/g, '/'));
  return path.basename(base, path.extname(base)).trim().toLowerCase();
}

/**
 * 按 ROM 文件名查中文资料。
 * 返回 { title, description } 或 null（对照表里没有就返回 null，调用方按默认处理）。
 */
export function lookupArcade(fileName) {
  const key = romsetKey(fileName);
  if (!key) return null;
  const hit = load()[key];
  if (!Array.isArray(hit) || !hit[0]) return null;
  return {
    title: String(hit[0]).trim(),
    description: String(hit[1] || '').trim(),
  };
}

/** 对照表规模，用于启动日志与后台展示 */
export function catalogSize() {
  return Object.keys(load()).length;
}
