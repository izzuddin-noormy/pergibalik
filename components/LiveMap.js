'use client';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

// OpenFreeMap: free vector map tiles, no API key, no usage limits (https://openfreemap.org)
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const VAN_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="11" rx="2"/><path d="M3 11h18"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/></svg>';

function vanHtml(v) {
  const label = v.label ? `<div class="vm-label">${v.label}</div>` : '';
  const dir = v.bearing != null && v.online
    ? `<div class="vm-dir" style="transform: rotate(${Math.round(v.bearing)}deg)"><i></i></div>` : '';
  return `${label}<div class="vm-box">${VAN_SVG}${dir}</div><div class="vm-id">${v.short}</div>`;
}

// A small box around one point, so single points can use fitBounds too (its padding doesn't stick to the map).
const box = (ml, [lng, lat], d = 0.0025) => new ml.LngLatBounds([lng - d, lat - d], [lng + d, lat + d]);

const EMPTY = { type: 'FeatureCollection', features: [] };
const lineFC = (list) => ({
  type: 'FeatureCollection',
  features: list.filter((l) => l.coords?.length > 1).map((l, i) => ({
    type: 'Feature', id: i,
    properties: { color: l.color || '#000000', width: l.width || 5, opacity: l.opacity ?? 1 },
    geometry: { type: 'LineString', coordinates: l.coords },
  })),
});

function ensureLayers(map) {
  if (!map.isStyleLoaded() || map.getSource('trails')) return !!map.getSource('trails');
  // Rider trails: fade in from where the van came from to where it is now.
  map.addSource('trails', { type: 'geojson', data: EMPTY, lineMetrics: true });
  map.addLayer({ id: 'trails-casing', type: 'line', source: 'trails', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'trails', type: 'line', source: 'trails', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': 5, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0.08)', 0.6, 'rgba(0,0,0,0.55)', 1, 'rgba(0,0,0,1)'] } });
  // Timeline routes: flat colours per segment.
  map.addSource('routes', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['+', ['get', 'width'], 4], 'line-opacity': ['get', 'opacity'] } });
  map.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] } });
  return true;
}

/**
 * props:
 *  vans: [{id, lat, lng, online, label, short}]
 *  me: {lat, lng} | null
 *  meStyle: 'rider' | 'driver'
 *  center: {lat, lng, key} | null (changing key pans the map there)
 *  onSelect(id)
 *  trails: [[ [lng,lat], ... ], ...]          rider view: recent path of each live van
 *  routes: [{coords, color, width, opacity}]  timeline view
 *  pins:   [{id, lng, lat, label}]            numbered stop pins
 *  fitTo:  {coords, key} | null               fit the view to these coordinates when key changes
 *  bottomPad: fraction of height covered by a bottom sheet (default 0.42)
 */
export default function LiveMap({ vans = [], me, meStyle = 'rider', center = null, onSelect, trails = null, routes = null, pins = null, fitTo = null, bottomPad = 0.42 }) {
  const el = useRef(null);
  const st = useRef({ ml: null, map: null, markers: new Map(), pinMarkers: new Map(), meMarker: null, autoFit: true, fitSig: '' });
  const selRef = useRef(onSelect);
  selRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('maplibre-gl');
      const ml = mod.default ?? mod;
      if (cancelled || st.current.map) return;
      const map = new ml.Map({
        container: el.current,
        style: STYLE_URL,
        center: [101.6869, 3.139], // Kuala Lumpur until we have a fix
        zoom: 11,
        attributionControl: false,
        pitchWithRotate: false,
        dragRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.AttributionControl({ compact: true }), 'top-left');
      const userMoved = (e) => { if (e.originalEvent) st.current.autoFit = false; };
      map.on('dragstart', userMoved);
      map.on('zoomstart', userMoved);
      window.__shuttleMap = map; // debugging aid
      st.current.ml = ml;
      st.current.map = map;
    })();
    return () => {
      cancelled = true;
      st.current.map?.remove();
      st.current = { ml: null, map: null, markers: new Map(), pinMarkers: new Map(), meMarker: null, autoFit: true, fitSig: '' };
    };
  }, []);

  useEffect(() => {
    let t;
    const sync = () => {
      const { ml, map, markers } = st.current;
      if (!map) { t = setTimeout(sync, 100); return; }
      const seen = new Set();
      vans.forEach((v) => {
        if (v.lat == null) return;
        seen.add(v.id);
        let m = markers.get(v.id);
        if (!m) {
          const node = document.createElement('div');
          node.addEventListener('click', () => selRef.current?.(node.dataset.id));
          m = new ml.Marker({ element: node, anchor: 'bottom' }).setLngLat([v.lng, v.lat]).addTo(map);
          markers.set(v.id, m);
        } else {
          m.setLngLat([v.lng, v.lat]);
        }
        const node = m.getElement();
        node.dataset.id = v.id;
        node.classList.add('vm');
        node.classList.toggle('vm-off', !v.online); // keep maplibre's own classes
        node.style.zIndex = v.online ? '2' : '1';
        const html = vanHtml(v);
        if (node._html !== html) { node.innerHTML = html; node._html = html; }
      });
      for (const [id, m] of markers) if (!seen.has(id)) { m.remove(); markers.delete(id); }

      if (me) {
        if (!st.current.meMarker) {
          const node = document.createElement('div');
          node.className = meStyle === 'driver' ? 'me-driver' : 'me-dot';
          node.style.zIndex = '3';
          st.current.meMarker = new ml.Marker({ element: node }).setLngLat([me.lng, me.lat]).addTo(map);
        } else st.current.meMarker.setLngLat([me.lng, me.lat]);
      }

      // Auto-fit to me + live vans whenever that set changes, until the user moves the map themselves.
      if (st.current.autoFit && !fitTo) {
        const live = vans.filter((v) => v.online && v.lat != null);
        const sig = live.map((v) => v.id).sort().join(',') + (me ? '|me' : '');
        if (sig && sig !== st.current.fitSig) {
          const pts = live.map((v) => [v.lng, v.lat]);
          // also show where each van came from: trail points within ~1 km behind it
          for (const t of trails || []) {
            const end = t[t.length - 1];
            for (const c of t) if (Math.abs(c[0] - end[0]) < 0.009 && Math.abs(c[1] - end[1]) < 0.009) pts.push(c);
          }
          if (me) pts.push([me.lng, me.lat]);
          const h = el.current?.clientHeight || 800;
          const padding = { top: 190, left: 60, right: 60, bottom: Math.round(40 + h * bottomPad) };
          try {
            const b = pts.length === 1 ? box(ml, pts[0]) : pts.reduce((bb, p) => bb.extend(p), new ml.LngLatBounds(pts[0], pts[0]));
            map.fitBounds(b, { padding, maxZoom: 16, duration: 0 });
            st.current.fitSig = sig;
          } catch (e) {
            console.warn('fit failed', e);
          }
        }
      }
    };
    sync();
    return () => clearTimeout(t);
  }, [vans, me, meStyle, fitTo, bottomPad, trails]);

  // Lines (trails / routes) live in map sources; retry until the style has loaded.
  useEffect(() => {
    let t;
    const draw = () => {
      const { map } = st.current;
      if (!map || !ensureLayers(map)) { t = setTimeout(draw, 150); return; }
      map.getSource('trails').setData(lineFC((trails || []).map((c) => ({ coords: c }))));
      map.getSource('routes').setData(lineFC(routes || []));
    };
    draw();
    return () => clearTimeout(t);
  }, [trails, routes]);

  // Numbered stop pins
  useEffect(() => {
    let t;
    const sync = () => {
      const { ml, map, pinMarkers } = st.current;
      if (!map) { t = setTimeout(sync, 100); return; }
      const seen = new Set();
      (pins || []).forEach((p) => {
        seen.add(p.id);
        let m = pinMarkers.get(p.id);
        if (!m) {
          const node = document.createElement('div');
          node.className = 'stop-pin';
          m = new ml.Marker({ element: node }).setLngLat([p.lng, p.lat]).addTo(map);
          pinMarkers.set(p.id, m);
        } else m.setLngLat([p.lng, p.lat]);
        m.getElement().textContent = p.label;
      });
      for (const [id, m] of pinMarkers) if (!seen.has(id)) { m.remove(); pinMarkers.delete(id); }
    };
    sync();
    return () => clearTimeout(t);
  }, [pins]);

  // Fit to a set of coordinates (timeline: whole day, or one segment)
  useEffect(() => {
    let t;
    const fit = () => {
      const { ml, map } = st.current;
      if (!fitTo?.coords?.length) return;
      if (!map) { t = setTimeout(fit, 100); return; }
      const h = el.current?.clientHeight || 400;
      const padding = { top: 70, left: 40, right: 40, bottom: Math.round(30 + h * bottomPad) };
      const c = fitTo.coords;
      const b = c.length === 1 ? box(ml, c[0], 0.0015) : c.reduce((bb, p) => bb.extend(p), new ml.LngLatBounds(c[0], c[0]));
      map.fitBounds(b, { padding, maxZoom: 16, duration: 400 });
    };
    fit();
    return () => clearTimeout(t);
  }, [fitTo?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = st.current.map;
    if (center && map) {
      st.current.autoFit = false;
      const h = el.current?.clientHeight || 800;
      map.easeTo({ center: [center.lng, center.lat], zoom: Math.max(map.getZoom(), 15), offset: [0, -Math.round((h * bottomPad) / 2)], duration: 600 });
    }
  }, [center?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map" />;
}
