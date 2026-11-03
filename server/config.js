import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

/** 持久化 JWT 密钥，避免重启后登录态全部失效 */
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const PORT = Number(process.env.PORT || 3000);
export const JWT_SECRET = resolveSecret();
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
export const ALLOW_REGISTER = process.env.ALLOW_REGISTER !== 'false';
/** 随仓库分发的 EmulatorJS 运行时（loader/内核/语言包），默认同源加载，不依赖外网与代理 */
export const EMULATOR_DIR = path.join(ROOT_DIR, 'server', 'public', 'emulatorjs');
export const EMULATOR_LOCAL_READY = fs.existsSync(path.join(EMULATOR_DIR, 'loader.js'));

export const EMULATOR_CDN =
  process.env.EMULATOR_CDN || (EMULATOR_LOCAL_READY ? '/emulatorjs/' : 'https://cdn.emulatorjs.org/stable/data/');
