import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';
import { db } from './db.js';

export const TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 天

export function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

export function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TOKEN_MAX_AGE,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('token', { path: '/' });
}

export function publicUser(row) {
  return { id: row.id, username: row.username, role: row.role, createdAt: row.created_at };
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies && req.cookies.token) return req.cookies.token;
  if (typeof req.query.t === 'string' && req.query.t) return req.query.t;
  return null;
}

/** 解析登录态，失败不报错 */
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = db
      .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
      .get(payload.uid);
    if (row) req.user = publicUser(row);
  } catch {
    /* 过期或伪造的 token 视为游客 */
  }
  next();
}

export function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  next();
}

export function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}
