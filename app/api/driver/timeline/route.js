import { NextResponse } from 'next/server';
import { db, cors } from '@/lib/db';
import { requireDriver } from '@/lib/auth';
import { fetchPings, toPoint } from '@/lib/pings';
import { cleanPoints, segment } from '@/lib/track';

export const dynamic = 'force-dynamic';
const out = (body, status = 200) => cors(NextResponse.json(body, { status }));

// GET /api/driver/timeline?date=YYYY-MM-DD  (day in Malaysia time). Only the signed-in driver's own history.
export async function GET(req) {
  const driver = await requireDriver(req);
  if (!driver) return out({ error: 'Please sign in again' }, 401);
  const date = new URL(req.url).searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out({ error: 'date=YYYY-MM-DD required' }, 400);
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 864e5);

  const rows = await fetchPings(() => db().from('van_pings')
    .select('van_id, lat, lng, speed, accuracy, recorded_at')
    .eq('driver_id', driver.id)
    .gte('recorded_at', start.toISOString())
    .lt('recorded_at', end.toISOString())
    .order('recorded_at', { ascending: true }));

  const pts = cleanPoints(rows.map(toPoint));
  const segments = segment(pts);
  const drives = segments.filter((s) => s.type === 'drive');
  const summary = {
    distanceM: drives.reduce((a, s) => a + s.distanceM, 0),
    drivingMs: drives.reduce((a, s) => a + (s.end - s.start), 0),
    stops: segments.filter((s) => s.type === 'stop').length,
    vans: [...new Set(rows.map((r) => r.van_id))],
    points: rows.length,
  };
  return out({ date, summary, segments });
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
