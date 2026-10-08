import { NextResponse } from 'next/server';
import { db, cors, cleanId } from '@/lib/db';
import { requireDriver } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const out = (body, status = 200) => cors(NextResponse.json(body, { status }));

export async function POST(req) {
  const driver = await requireDriver(req);
  if (!driver) return out({ error: 'Please sign in again' }, 401);
  const b = await req.json().catch(() => null);
  const id = cleanId(b?.vanId);
  if (!id) return out({ error: 'vanId required' }, 400);
  const { error } = await db().from('vans').update({ online: false }).eq('id', id).eq('driver_id', driver.id);
  if (error) return out({ error: error.message }, 500);
  return out({ ok: true });
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
