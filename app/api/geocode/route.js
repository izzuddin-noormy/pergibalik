import { NextResponse } from 'next/server';
import { db, cors, num } from '@/lib/db';
import { requireDriver } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const out = (body, status = 200) => cors(NextResponse.json(body, { status }));

// Street name for a timeline stop. OpenStreetMap Nominatim (free; ≤1 request/s), cached per ~100 m.
export async function GET(req) {
  if (!(await requireDriver(req))) return out({ error: 'Please sign in again' }, 401);
  const q = new URL(req.url).searchParams;
  const lat = num(q.get('lat')), lng = num(q.get('lng'));
  if (lat == null || lng == null) return out({ error: 'lat,lng required' }, 400);
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;

  const { data: hit } = await db().from('place_cache').select('label').eq('key', key).maybeSingle();
  if (hit) return out({ label: hit.label });

  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': process.env.VERCEL_PROJECT_PRODUCTION_URL ? `PergiBalik/1.0 (+https://${process.env.VERCEL_PROJECT_PRODUCTION_URL})` : 'PergiBalik/1.0', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    const a = j.address || {};
    const place = j.name || a.amenity || a.building || a.shop || a.office;
    const road = a.road || a.pedestrian || a.neighbourhood;
    const area = a.suburb || a.city_district || a.town || a.city || a.village;
    const label = [place || road, area].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(', ') || null;
    if (!label) return out({ label: null });
    await db().from('place_cache').upsert({ key, label });
    return out({ label });
  } catch {
    return out({ label: null });
  }
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
