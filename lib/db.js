import { createClient } from '@supabase/supabase-js';

let client;
export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export const ONLINE_WINDOW_MS = 2 * 60 * 1000; // no ping for 2 min => shown offline

export function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function cleanId(v) {
  return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 20);
}
export function cleanText(v, n = 40) {
  return v == null ? null : String(v).trim().slice(0, n) || null;
}
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
