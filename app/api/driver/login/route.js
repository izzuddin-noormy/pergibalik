import { NextResponse } from 'next/server';
import { db, cors } from '@/lib/db';
import { normalizePhone, verifyPin, signToken, publicDriver, MAX_ATTEMPTS, LOCK_MINUTES } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const out = (body, status = 200) => cors(NextResponse.json(body, { status }));
const WRONG = 'Wrong mobile number or PIN';

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const phone = normalizePhone(b.phone);
  if (!phone || !/^\d{6}$/.test(String(b.pin || ''))) return out({ error: WRONG }, 401);

  const { data: d } = await db().from('drivers').select('*').eq('phone', phone).maybeSingle();
  if (!d) return out({ error: WRONG }, 401);
  if (d.disabled) return out({ error: 'This account is disabled. Contact the fleet admin.' }, 403);
  if (d.locked_until && new Date(d.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(d.locked_until) - Date.now()) / 60000);
    return out({ error: `Too many wrong PINs. Try again in ${mins} min.` }, 429);
  }

  if (!verifyPin(b.pin, d.pin_hash)) {
    const n = d.failed_attempts + 1;
    const lock = n >= MAX_ATTEMPTS;
    await db().from('drivers').update({
      failed_attempts: lock ? 0 : n,
      locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
    }).eq('id', d.id);
    return out({ error: lock ? `Too many wrong PINs. Locked for ${LOCK_MINUTES} min.` : WRONG }, 401);
  }

  await db().from('drivers').update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq('id', d.id);
  return out({ token: signToken(d.id), driver: publicDriver(d) });
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
