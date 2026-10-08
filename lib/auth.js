import crypto from 'node:crypto';
import { db } from '@/lib/db';

const TOKEN_DAYS = 30;
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET not set');
  return s;
}

/** Normalise a Malaysian mobile number to E.164 (+601XXXXXXXX). Returns null if invalid. */
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('60')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^1\d{8,9}$/.test(d)) return null;
  return '+60' + d;
}

export function validPin(pin) {
  const p = String(pin || '');
  if (!/^\d{6}$/.test(p)) return 'PIN must be exactly 6 digits';
  if (/^(\d)\1{5}$/.test(p) || ['123456', '654321', '012345', '123123'].includes(p)) return 'PIN is too easy to guess';
  return null;
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPin(pin, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(String(pin), Buffer.from(saltHex, 'hex'), want.length);
  return crypto.timingSafeEqual(want, got);
}

const b64 = (b) => Buffer.from(b).toString('base64url');

export function signToken(driverId) {
  const payload = b64(JSON.stringify({ sub: driverId, exp: Date.now() + TOKEN_DAYS * 864e5 }));
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function readToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const want = crypto.createHmac('sha256', secret()).update(payload).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

/** Returns the signed-in, active driver for this request, or null. */
export async function requireDriver(req) {
  const h = req.headers.get('authorization') || '';
  const t = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!t) return null;
  const { data } = await db().from('drivers').select('id, name, phone, disabled').eq('id', t.sub).maybeSingle();
  if (!data || data.disabled) return null;
  return data;
}

export const publicDriver = (d) => ({ name: d.name, phone: d.phone });
