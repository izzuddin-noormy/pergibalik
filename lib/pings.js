import { db } from '@/lib/db';

/** Fetch pings page by page (PostgREST returns max 1000 rows per request). */
export async function fetchPings(build, max = 30000) {
  const rows = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

export const toPoint = (r) => ({
  lat: r.lat, lng: r.lng, t: new Date(r.recorded_at).getTime(),
  speed: r.speed, accuracy: r.accuracy, van: r.van_id,
});

export { db };
