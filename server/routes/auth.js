import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { ALLOW_REGISTER } from '../config.js';
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  publicUser,
  authRequired,
} from '../auth.js';

const router = express.Router();

const USERNAME_RE = /^[\w\u4e00-\u9fa5.-]{3,20}$/;

/** 极简登录失败限流：同一用户名 10 分钟内最多失败 8 次 */
const failed = new Map();
const WINDOW = 10 * 60 * 1000;
const MAX_FAIL = 8;

function tooManyAttempts(key) {
  const rec = failed.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW) {
    failed.delete(key);
    return false;
  }
  return rec.count >= MAX_FAIL;
}

function recordFailure(key) {
  const rec = failed.get(key);
  if (!rec || Date.now() - rec.first > WINDOW) {
    failed.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

router.post('/register', (req, res) => {
  if (!ALLOW_REGISTER) return res.status(403).json({ error: '管理员已关闭注册' });
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: '用户名需 3-20 位，可用中文、字母、数字、下划线' });
  }
  if (password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: '密码长度需 6-72 位' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '该用户名已被占用' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')")
    .run(username, hash);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(row);
  setAuthCookie(res, token);
  res.status(201).json({ token, user: publicUser(row) });
});

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const key = username.toLowerCase();

  if (tooManyAttempts(key)) {
    return res.status(429).json({ error: '尝试次数过多，请 10 分钟后再试' });
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    recordFailure(key);
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  failed.delete(key);
  const token = signToken(row);
  setAuthCookie(res, token);
  res.json({ token, user: publicUser(row) });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.post('/password', authRequired, (req, res) => {
  const oldPassword = String(req.body?.oldPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 6 || newPassword.length > 72) {
    return res.status(400).json({ error: '新密码长度需 6-72 位' });
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(oldPassword, row.password_hash)) {
    return res.status(401).json({ error: '原密码不正确' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(newPassword, 10),
    req.user.id,
  );
  res.json({ ok: true });
});

export default router;
