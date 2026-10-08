import { NextResponse } from 'next/server';
import { db, cors, cleanId, cleanText, num, ONLINE_WINDOW_MS } from '@/lib/db';
import { requireDriver } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const out = (body, status = 200) => cors(NextResponse.json(body, { status }));

export async function POST(req) {
  const driver = await requireDriver(req);
  if (!driver) return out({ error: 'Please sign in again' }, 401);

  const b = await req.json().catch(() => null);
  const id = cleanId(b?.vanId);
  const lat = num(b?.lat), lng = num(b?.lng);
  if (!id || lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return out({ error: 'vanId, lat, lng required' }, 400);
  }

  // A van that is live under another driver can't be taken over.
  const { data: cur } = await db().from('vans').select('driver_id, online, updated_at').eq('id', id).maybeSingle();
  if (cur && cur.online && cur.driver_id && cur.driver_id !== driver.id &&
      Date.now() - new Date(cur.updated_at).getTime() < ONLINE_WINDOW_MS) {
    return out({ error: `${id} is already online with another driver` }, 409);
  }

  const row = {
    id,
    driver_id: driver.id,
    driver_name: driver.name,
    route: cleanText(b.route),
    lat, lng,
    heading: num(b.heading),
    speed: num(b.speed),
    accuracy: num(b.accuracy),
    online: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db().from('vans').upsert(row);
  if (error) return out({ error: error.message }, 500);

  // History for the rider trail and the driver's own timeline.
  await db().from('van_pings').insert({
    driver_id: driver.id, van_id: id, lat, lng,
    speed: row.speed, heading: row.heading, accuracy: row.accuracy, recorded_at: row.updated_at,
  });
  // Housekeeping: now and then, drop history older than 90 days.
  if (Math.random() < 0.002) {
    await db().from('van_pings').delete().lt('recorded_at', new Date(Date.now() - 90 * 864e5).toISOString());
  }
  return out({ ok: true, at: row.updated_at });
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
