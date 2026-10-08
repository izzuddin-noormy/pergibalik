import { NextResponse } from 'next/server';
import { db, cors, ONLINE_WINDOW_MS } from '@/lib/db';
import { fetchPings, toPoint } from '@/lib/pings';
import { cleanPoints, thin } from '@/lib/track';

export const dynamic = 'force-dynamic';
const TRAIL_MS = 10 * 60 * 1000; // riders see where a van has come from over the last 10 minutes

export async function GET() {
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from('vans')
    .select('id, driver_id, driver_name, route, lat, lng, heading, speed, accuracy, online, updated_at')
    .gte('updated_at', since)
    .order('id');
  if (error) return cors(NextResponse.json({ error: error.message }, { status: 500 }));
  const now = Date.now();
  const vans = data.map((v) => ({ ...v, online: v.online && now - new Date(v.updated_at).getTime() < ONLINE_WINDOW_MS }));

  // Recent trail for vans that are live right now (current driver only).
  const live = vans.filter((v) => v.online && v.driver_id);
  if (live.length) {
    try {
      const rows = await fetchPings(() => db().from('van_pings')
        .select('van_id, driver_id, lat, lng, speed, accuracy, recorded_at')
        .in('van_id', live.map((v) => v.id))
        .gte('recorded_at', new Date(now - TRAIL_MS).toISOString())
        .order('recorded_at', { ascending: true }), 5000);
      for (const v of live) {
        const pts = cleanPoints(rows.filter((r) => r.van_id === v.id && r.driver_id === v.driver_id).map(toPoint));
        pts.push({ lat: v.lat, lng: v.lng, t: new Date(v.updated_at).getTime() });
        v.trail = thin(pts, 10).slice(-150).map((p) => [p.lng, p.lat]);
      }
    } catch { /* trail is a nice-to-have */ }
  }
  const out = vans.map(({ driver_id, ...v }) => v);
  return cors(NextResponse.json({ vans: out, serverTime: new Date(now).toISOString() }));
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
