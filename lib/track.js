// Shared GPS helpers (server side).
export function distM(a, b) {
  const R = 6371000, r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Drop inaccurate fixes and impossible jumps (> ~160 km/h). Points need {lat,lng,t(ms),accuracy}. */
export function cleanPoints(pts, maxAcc = 60) {
  const out = [];
  for (const p of pts) {
    if (p.accuracy != null && p.accuracy > maxAcc) continue;
    const prev = out[out.length - 1];
    if (prev) {
      const dt = (p.t - prev.t) / 1000;
      if (dt <= 0) continue;
      if (distM(prev, p) / dt > 45) continue;
    }
    out.push(p);
  }
  return out;
}

/** Keep points at least `minM` metres apart (always keeps first and last). */
export function thin(pts, minM = 12) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (distM(out[out.length - 1], pts[i]) >= minM) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Split a day of points into stops and drives (stay-point detection).
 * stop  = stayed within `radius` m for at least `minStopMs`
 * gap   = no data for more than `gapMs`
 */
export function segment(pts, { radius = 120, minStopMs = 3 * 60e3, gapMs = 10 * 60e3 } = {}) {
  const segs = [];
  // 1) sessions separated by data gaps
  const sessions = [];
  let cur = [];
  for (const p of pts) {
    if (cur.length && p.t - cur[cur.length - 1].t > gapMs) { sessions.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) sessions.push(cur);

  sessions.forEach((s, si) => {
    if (si > 0) segs.push({ type: 'gap', start: sessions[si - 1].at(-1).t, end: s[0].t });
    // 2) find stays inside the session
    const stays = [];
    let i = 0;
    while (i < s.length) {
      let j = i + 1;
      while (j < s.length && distM(s[i], s[j]) <= radius) j++;
      if (s[j - 1].t - s[i].t >= minStopMs) { stays.push([i, j - 1]); i = j; } else i++;
    }
    // 3) stops + drives between them
    let k = 0;
    const pushDrive = (a, b) => {
      const path = s.slice(a, b + 1);
      if (path.length < 2) return;
      let d = 0, vmax = 0;
      for (let x = 1; x < path.length; x++) {
        d += distM(path[x - 1], path[x]);
        if (path[x].speed != null) vmax = Math.max(vmax, path[x].speed);
      }
      if (d < 50) return; // jitter, not a drive
      const dur = path.at(-1).t - path[0].t;
      segs.push({
        type: 'drive', start: path[0].t, end: path.at(-1).t, distanceM: Math.round(d),
        avgKmh: dur > 0 ? Math.round((d / (dur / 1000)) * 3.6) : null,
        maxKmh: vmax ? Math.round(vmax * 3.6) : null,
        path: thin(path).map((p) => [round6(p.lng), round6(p.lat)]),
      });
    };
    for (const [a, b] of stays) {
      if (a > k) pushDrive(k, a);
      const pts2 = s.slice(a, b + 1);
      const lat = pts2.reduce((x, p) => x + p.lat, 0) / pts2.length;
      const lng = pts2.reduce((x, p) => x + p.lng, 0) / pts2.length;
      segs.push({ type: 'stop', start: s[a].t, end: s[b].t, lat: round6(lat), lng: round6(lng) });
      k = b;
    }
    if (k < s.length - 1) pushDrive(k, s.length - 1);
  });

  // Merge back-to-back stops at the same place (a short shuffle in a car park is not a drive).
  const merged = [];
  for (const g of segs) {
    const prev = merged[merged.length - 1];
    if (g.type === 'stop' && prev?.type === 'stop' && distM(prev, g) <= radius * 1.5) prev.end = g.end;
    else merged.push(g);
  }
  return merged;
}

const round6 = (x) => Math.round(x * 1e6) / 1e6;
