import { NextResponse } from 'next/server';
import { db, cors, cleanText } from '@/lib/db';
import { normalizePhone, validPin, hashPin, signToken, publicDriver } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const out = (body, status = 200) => cors(NextResponse.json(body, { status }));

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const name = cleanText(b.name, 60);
  const phone = normalizePhone(b.phone);
  if (!name || name.length < 2) return out({ error: 'Please enter your full name' }, 400);
  if (!phone) return out({ error: 'Enter a valid Malaysian mobile number' }, 400);
  const pinErr = validPin(b.pin);
  if (pinErr) return out({ error: pinErr }, 400);

  const { data, error } = await db()
    .from('drivers')
    .insert({ name, phone, pin_hash: hashPin(b.pin), last_login_at: new Date().toISOString() })
    .select('id, name, phone')
    .single();
  if (error) {
    if (error.code === '23505') return out({ error: 'This number is already registered. Please sign in.' }, 409);
    return out({ error: 'Could not register right now' }, 500);
  }
  return out({ token: signToken(data.id), driver: publicDriver(data) });
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
