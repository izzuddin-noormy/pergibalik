'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { CapacitorHttp } from '@capacitor/core';
import { distanceKm, etaMin, ago } from '@/lib/geo';
import {
  requestLocationPermission,
  checkLocationPermission,
  watchForeground,
  startDriverTracking,
  openAppSettings,
  isNative,
} from '@/lib/location';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

const store = {
  get(k, d) { try { const v = localStorage.getItem('shuttle.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('shuttle.' + k, JSON.stringify(v)); } catch {} },
};

const VanIcon = ({ color = '#000', size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="11" rx="2" /><path d="M3 11h18" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" />
  </svg>
);
const Chevron = ({ color = '#000', dir = 'right' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d={dir === 'right' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
  </svg>
);

export default function App() {
  const [screen, setScreen] = useState(null); // welcome | driverAuth | permission | rider | driver
  const [role, setRole] = useState(null);
  const [driver, setDriver] = useState(null);

  const goRole = async (r) => {
    const p = await checkLocationPermission();
    setScreen(p === 'granted' ? r : 'permission');
  };

  useEffect(() => {
    const r = store.get('role', null);
    if (r === 'rider') { setRole('rider'); goRole('rider'); return; }
    if (r === 'driver' && store.get('driverToken', null)) {
      setRole('driver');
      setDriver(store.get('driver', null));
      goRole('driver');
      // Refresh profile in the background; a revoked/expired token signs the driver out.
      getJson('/api/driver/me').then((j) => { setDriver(j.driver); store.set('driver', j.driver); }).catch((e) => { if (e.status === 401 || e.status === 403) signOut(); });
      return;
    }
    setScreen('welcome');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const findRides = () => { setRole('rider'); store.set('role', 'rider'); setScreen('permission'); };
  const onSignedIn = (token, d) => {
    store.set('driverToken', token); store.set('driver', d); store.set('role', 'driver');
    setDriver(d); setRole('driver'); goRole('driver');
  };
  const signOut = () => {
    store.set('driverToken', null); store.set('driver', null); store.set('role', null);
    setDriver(null); setRole(null); setScreen('welcome');
  };
  const backToStart = () => { store.set('role', null); setRole(null); setScreen('welcome'); };

  if (!screen) return <div className="splash"><img src="/brand.png" alt="PergiBalik" width="88" height="88" /></div>;
  if (screen === 'welcome') return <WelcomeScreen onFindRides={findRides} onDriver={() => setScreen('driverAuth')} />;
  if (screen === 'driverAuth') return <DriverAuthScreen onBack={() => setScreen('welcome')} onSignedIn={onSignedIn} />;
  if (screen === 'permission')
    return <PermissionScreen role={role} onBack={role === 'driver' ? signOut : backToStart} onDone={() => setScreen(role)} />;
  if (screen === 'rider') return <RiderScreen onExit={backToStart} />;
  return <DriverScreen driver={driver} onSignOut={signOut} />;
}

/* ---------- 1. Welcome ---------- */
function WelcomeScreen({ onFindRides, onDriver }) {
  return (
    <main className="screen dark role">
      <div className="brand"><img className="brand-mark" src="/brand.png" alt="" width="40" height="40" />PergiBalik</div>
      <h1 className="hero">Where&rsquo;s my van?</h1>
      <p className="lead">See the company shuttle vans live on the map and when they will reach you.</p>
      <div className="grow" />
      <button className="btn-find" onClick={onFindRides}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        Find rides
      </button>
      <p className="foot">No sign-in needed</p>
      <button className="driver-link" onClick={onDriver}>Driver sign in</button>
    </main>
  );
}

/* ---------- 1b. Driver sign in / register ---------- */
function DriverAuthScreen({ onBack, onSignedIn }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(() => store.get('lastPhone', ''));
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const reg = mode === 'register';
  const digits = (v) => v.replace(/\D/g, '').slice(0, 6);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (reg && pin !== pin2) return setErr('PINs do not match');
    setBusy(true);
    try {
      const j = await postJson(reg ? '/api/driver/register' : '/api/driver/login', reg ? { name, phone, pin } : { phone, pin }, { noAuth: true });
      store.set('lastPhone', phone);
      onSignedIn(j.token, j.driver);
    } catch (e2) {
      setErr(e2.message);
      setPin(''); setPin2('');
    } finally {
      setBusy(false);
    }
  };
  const canSubmit = phone.replace(/\D/g, '').length >= 9 && pin.length === 6 && (!reg || (name.trim().length >= 2 && pin2.length === 6));

  return (
    <main className="screen light auth">
      <button className="icon-btn grey" aria-label="Back" onClick={onBack}><Chevron dir="left" /></button>
      <h1 className="title">{reg ? 'Register as a driver' : 'Driver sign in'}</h1>
      <p className="body">{reg ? 'Use your own mobile number and pick a 6-digit PIN.' : 'Sign in with your mobile number and PIN.'}</p>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={!reg} className={!reg ? 'on' : ''} onClick={() => { setMode('signin'); setErr(null); }}>Sign in</button>
        <button role="tab" aria-selected={reg} className={reg ? 'on' : ''} onClick={() => { setMode('register'); setErr(null); }}>Register</button>
      </div>
      <form className="fields" onSubmit={submit}>
        {reg && (
          <label className="field"><span>Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="As on your staff ID" maxLength={60} autoComplete="name" />
          </label>
        )}
        <label className="field"><span>Mobile number</span>
          <span className="phone-row"><span className="cc">+60</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="12 345 6789" inputMode="tel" autoComplete="tel" maxLength={16} />
          </span>
        </label>
        <label className="field"><span>{reg ? 'Create PIN' : 'PIN'}</span>
          <input className="pin" type="password" inputMode="numeric" autoComplete={reg ? 'new-password' : 'current-password'} value={pin} onChange={(e) => setPin(digits(e.target.value))} placeholder="6 digits" />
        </label>
        {reg && (
          <label className="field"><span>Confirm PIN</span>
            <input className="pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(digits(e.target.value))} placeholder="6 digits" />
          </label>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <p className="fine">{reg ? 'Your name and van are shown to riders while you are online. Your location is only shared while you are on shift.' : 'Forgot your PIN? Ask the fleet admin to reset it.'}</p>
        <button className="btn-primary" type="submit" disabled={!canSubmit || busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Sign in'}</button>
      </form>
    </main>
  );
}

/* ---------- 2. Permission ---------- */
function PermissionScreen({ role, onBack, onDone }) {
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    const r = await requestLocationPermission();
    setBusy(false);
    if (r === 'granted') onDone();
    else setDenied(true);
  };
  return (
    <main className="screen light perm">
      <button className="icon-btn grey" aria-label="Back" onClick={onBack}><Chevron dir="left" /></button>
      <div className="perm-art"><div><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg></div></div>
      <h1 className="title">Turn on location</h1>
      {role === 'driver' ? (
        <p className="body">Your van&rsquo;s location is shared every few seconds while you are on shift, including when the screen is off. It stops when you go offline.</p>
      ) : (
        <p className="body">We use your location to show the vans nearest to you and how far away they are. It is only used while the app is open and is never shared.</p>
      )}
      {denied && (
        <div className="alert">
          Location is blocked. {isNative() ? 'Open Settings › Permissions › Location and choose “Allow”.' : 'Allow location for this site in your browser settings.'}
          {isNative() && <button className="link" onClick={openAppSettings}>Open settings</button>}
        </div>
      )}
      <div className="grow" />
      <button className="btn-primary" onClick={ask} disabled={busy}>{busy ? 'Waiting…' : 'Allow location'}</button>
      {role === 'rider' && <button className="btn-text" onClick={onDone}>Not now</button>}
    </main>
  );
}

/* ---------- shared: poll vans ---------- */
function useVans(intervalMs = 4000) {
  const [vans, setVans] = useState([]);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let stop = false, t;
    const tick = async () => {
      try {
        const r = await fetch('/api/vans', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Server error');
        if (!stop) { setVans(j.vans); setError(null); setNow(Date.now()); }
      } catch (e) {
        if (!stop) setError(e.message || 'Offline');
      }
      if (!stop) t = setTimeout(tick, document.hidden ? intervalMs * 4 : intervalMs);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [intervalMs]);
  return { vans, error, now };
}

function httpError(msg, status) { const e = new Error(msg); e.status = status; return e; }
function authHeaders(opts) {
  const h = { 'Content-Type': 'application/json' };
  const t = !opts?.noAuth && store.get('driverToken', null);
  if (t) h.Authorization = 'Bearer ' + t;
  return h;
}
// In the APK, post through native HTTP so Android doesn't throttle WebView requests in the background.
async function postJson(path, body, opts) {
  if (isNative()) {
    const r = await CapacitorHttp.post({ url: window.location.origin + path, headers: authHeaders(opts), data: body });
    if (r.status >= 400) throw httpError(r.data?.error || 'Server error ' + r.status, r.status);
    return r.data;
  }
  const r = await fetch(path, { method: 'POST', headers: authHeaders(opts), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpError(j.error || 'Server error', r.status);
  return j;
}
async function getJson(path) {
  const r = await fetch(path, { headers: authHeaders(), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpError(j.error || 'Server error', r.status);
  return j;
}

function bearingOf(trail) {
  if (!trail || trail.length < 2) return null;
  const [lng2, lat2] = trail[trail.length - 1];
  for (let i = trail.length - 2; i >= 0; i--) {
    const [lng1, lat1] = trail[i];
    if (distanceKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) < 0.008) continue; // need ≥ 8 m of movement
    const r = Math.PI / 180, y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
    const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  return null;
}

const shortId = (id) => (id.match(/\d+/)?.[0] || id.slice(0, 3)).slice(-3).padStart(2, '0');

/* ---------- 3. Rider ---------- */
function RiderScreen({ onExit }) {
  const { vans, error, now } = useVans(4000);
  const [me, setMe] = useState(null);
  const [center, setCenter] = useState(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let stop;
    watchForeground((p) => setMe({ lat: p.lat, lng: p.lng }), () => {}).then((s) => (stop = s)).catch(() => {});
    return () => stop?.();
  }, []);

  const rows = useMemo(() => {
    const list = vans.map((v) => {
      const km = me && v.lat != null ? distanceKm(me, v) : null;
      return { ...v, km, eta: km != null && v.online ? etaMin(km) : null, short: shortId(v.id) };
    });
    list.sort((a, b) => (b.online - a.online) || ((a.km ?? 1e9) - (b.km ?? 1e9)) || a.id.localeCompare(b.id));
    return list;
  }, [vans, me]);
  const mapVans = rows.map((v) => ({ ...v, bearing: bearingOf(v.trail), label: v.eta != null ? `${v.eta} min` : v.online ? 'Live' : null }));
  // Where each live van has come from (last ~10 min). Held only in memory: gone when the app is closed.
  const trails = useMemo(() => rows.filter((v) => v.online && v.trail?.length > 1).map((v) => v.trail), [rows]);
  const live = rows.filter((v) => v.online).length;
  const onSelect = useCallback((id) => {
    const v = vans.find((x) => x.id === id);
    if (v) setCenter({ lat: v.lat, lng: v.lng, key: Date.now() });
  }, [vans]);

  return (
    <main className="screen map-screen">
      <LiveMap vans={mapVans} me={me} meStyle="rider" center={center} onSelect={onSelect} trails={trails} />
      <div className="topbar">
        <button className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}><MenuIcon /></button>
        <button className="icon-btn" aria-label="Recenter on me" disabled={!me} onClick={() => me && setCenter({ ...me, key: Date.now() })}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z" /></svg>
        </button>
      </div>
      <section className="sheet">
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{live ? 'Vans near you' : 'No vans running'}</h2>
          {error ? <span className="status warn">Reconnecting…</span> : <span className="status"><i />Live</span>}
        </div>
        <ul className="van-list">
          {rows.length === 0 && <li className="empty">No van has shared its location in the last 12 hours.</li>}
          {rows.map((v) => (
            <li key={v.id}>
              <button className={'van-row' + (v.online ? '' : ' off')} onClick={() => v.lat != null && setCenter({ lat: v.lat, lng: v.lng, key: Date.now() })}>
                <span className="badge">{v.short}</span>
                <span className="vr-text">
                  <b>{v.id}{v.route ? ` · ${v.route}` : ''}</b>
                  <span>
                    {v.online
                      ? [v.driver_name, v.km != null ? `${v.km < 1 ? Math.round(v.km * 1000) + ' m' : v.km.toFixed(1) + ' km'} away` : null].filter(Boolean).join(' · ') || 'On the road'
                      : `Offline · last seen ${ago(v.updated_at, now)}`}
                  </span>
                </span>
                {v.eta != null && <span className="eta"><b>{v.eta}</b><span>min</span></span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="fine">{me ? 'Arrival times are estimates based on distance.' : 'Turn on location to see distance and arrival times.'}</p>
      </section>
      {menu && <Menu title="Finding rides" items={[{ label: 'Back to start', onClick: onExit }]} onClose={() => setMenu(false)} />}
    </main>
  );
}

/* ---------- 4. Driver ---------- */
function DriverScreen({ driver, onSignOut }) {
  const [vanId, setVanId] = useState(() => store.get('vanId', ''));
  const [route, setRoute] = useState(() => store.get('route', ''));
  const [online, setOnline] = useState(false);
  const [pos, setPos] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const [sendErr, setSendErr] = useState(null);
  const [permErr, setPermErr] = useState(false);
  const [menu, setMenu] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [, force] = useState(0);
  const stopRef = useRef(null);
  const lastPost = useRef(0);
  const latest = useRef(null);
  const cfg = useRef({});
  cfg.current = { vanId, route };

  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  // Preview own position while offline
  useEffect(() => {
    if (online) return;
    let stop;
    watchForeground((p) => setPos(p), () => {}).then((s) => (stop = s)).catch(() => {});
    return () => stop?.();
  }, [online]);

  const send = useCallback(async (p) => {
    const { vanId, route } = cfg.current;
    try {
      const body = { vanId, route, lat: p.lat, lng: p.lng, heading: p.heading, speed: p.speed, accuracy: p.accuracy };
      await postJson('/api/location', body);
      setLastSent(Date.now());
      setSendErr(null);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { stopRef.current?.(); onSignOut(); return; }
      if (e.status === 409) { stopRef.current?.(); stopRef.current = null; setOnline(false); }
      setSendErr(e.message || 'Network error');
    }
  }, [onSignOut]);

  const onPos = useCallback((p) => {
    latest.current = p;
    setPos(p);
    const t = Date.now();
    if (t - lastPost.current >= 4000) { lastPost.current = t; send(p); }
  }, [send]);

  // Heartbeat so riders still see the van as live when it is parked (no movement => no new fixes)
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => {
      if (latest.current && Date.now() - lastPost.current > 30000) { lastPost.current = Date.now(); send(latest.current); }
    }, 10000);
    return () => clearInterval(t);
  }, [online, send]);

  const goOnline = async () => {
    if (!vanId.trim()) return;
    store.set('vanId', vanId.trim()); store.set('route', route.trim());
    setPermErr(false);
    try {
      stopRef.current = await startDriverTracking(onPos, (e) => { if (e?.code === 1) { setPermErr(true); goOffline(); } });
      setOnline(true);
      if (pos && Date.now() - pos.time < 60000) onPos(pos); // send the last fix straight away
    } catch (e) {
      setSendErr(e.message || 'Could not start location');
    }
  };
  const goOffline = async () => {
    setOnline(false);
    try { await stopRef.current?.(); } catch {}
    stopRef.current = null;
    if (cfg.current.vanId) postJson('/api/offline', { vanId: cfg.current.vanId }).catch(() => {});
  };
  useEffect(() => () => { stopRef.current?.(); }, []);

  const speedKmh = pos?.speed != null && pos.speed >= 0 ? Math.round(pos.speed * 3.6) : null;
  const me = pos ? { lat: pos.lat, lng: pos.lng } : null;

  return (
    <main className="screen map-screen">
      <LiveMap vans={[]} me={me} meStyle="driver" center={online && me ? { ...me, key: pos.time } : null} />
      <div className="topbar">
        <button className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}><MenuIcon /></button>
        <div className={'pill ' + (online ? 'on' : 'off')}><i />{online ? 'Online' : 'Offline'}</div>
        <span style={{ width: 48 }} />
      </div>
      <section className="sheet">
        <div className="grabber" />
        <h2>{online ? 'You’re sharing location' : `Hi ${driver?.name?.split(' ')[0] || 'driver'}, you’re offline`}</h2>
        <p className="sub">
          {online ? `Riders can see ${vanId} on the map. Keep driving — it works with the screen off.` : 'Enter your van and go online when your shift starts.'}
        </p>
        {permErr && (
          <div className="alert">Location permission is off. <button className="link" onClick={openAppSettings}>Open settings</button></div>
        )}
        {!online && (
          <div className="fields">
            <label className="field"><span>Van number *</span><input value={vanId} onChange={(e) => setVanId(e.target.value.toUpperCase())} placeholder="e.g. VAN 01" maxLength={20} autoCapitalize="characters" /></label>
            <label className="field"><span>Route</span><input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Optional, e.g. HQ – LRT" maxLength={40} /></label>
          </div>
        )}
        {online && (
          <div className="stats">
            <div><span>Last sent</span><b>{lastSent ? ago(new Date(lastSent).toISOString()) : '—'}</b></div>
            <div><span>Speed</span><b>{speedKmh != null ? `${speedKmh} km/h` : '—'}</b></div>
            <div><span>Accuracy</span><b>{pos?.accuracy != null ? `±${Math.round(pos.accuracy)} m` : '—'}</b></div>
          </div>
        )}
        {sendErr && <p className="err">{online ? `Not sending: ${sendErr}. Retrying…` : sendErr}</p>}
        {online ? (
          <button className="btn-big stop" onClick={goOffline}>Go offline</button>
        ) : (
          <button className="btn-big" onClick={goOnline} disabled={!vanId.trim()}>Go online</button>
        )}
      </section>
      {menu && (
        <Menu title={driver?.name || 'Driver'} subtitle={driver?.phone} onClose={() => setMenu(false)} items={[
          { label: 'My timeline', onClick: () => { setMenu(false); setShowTimeline(true); } },
          { label: 'Sign out', onClick: async () => { if (online) await goOffline(); onSignOut(); } },
        ]} />
      )}
      {showTimeline && <TimelineScreen onClose={() => setShowTimeline(false)} />}
    </main>
  );
}

function MenuIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}

function Menu({ title, subtitle, items, onClose }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="menu" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {subtitle && <p className="muted small">{subtitle}</p>}
        {items.map((it) => <button key={it.label} className="menu-item" onClick={it.onClick}>{it.label}</button>)}
        <button className="menu-item ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ---------- 5. Driver: My timeline ---------- */
const TZ = 'Asia/Kuala_Lumpur';
const dayStr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
const shiftDay = (ds, n) => dayStr(new Date(Date.parse(ds + 'T12:00:00+08:00') + n * 864e5));
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-MY', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`; };
const fmtKm = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const ROUTE_COLORS = ['#0E7C47', '#000000'];

function TimelineScreen({ onClose }) {
  const today = dayStr(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [names, setNames] = useState({});
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    let stop = false;
    setData(null); setErr(null); setFocus(null);
    getJson(`/api/driver/timeline?date=${date}`).then((j) => !stop && setData(j)).catch((e) => !stop && setErr(e.message));
    return () => { stop = true; };
  }, [date]);

  // Street names for stops, one at a time (the free lookup service allows ~1 request per second).
  useEffect(() => {
    if (!data) return;
    let stop = false;
    (async () => {
      for (const sg of data.segments.filter((x) => x.type === 'stop')) {
        if (stop) return;
        const k = `${sg.lat},${sg.lng}`;
        try {
          const j = await getJson(`/api/geocode?lat=${sg.lat}&lng=${sg.lng}`);
          if (!stop && j.label) setNames((n) => ({ ...n, [k]: j.label }));
        } catch {}
        await new Promise((r) => setTimeout(r, 1100));
      }
    })();
    return () => { stop = true; };
  }, [data]);

  const view = useMemo(() => {
    if (!data) return null;
    let n = 0, d = 0;
    const segs = data.segments.map((sg, i) => {
      if (sg.type === 'stop') return { ...sg, i, num: ++n };
      if (sg.type === 'drive') return { ...sg, i, color: ROUTE_COLORS[d++ % 2] };
      return { ...sg, i };
    });
    const routes = segs.filter((x) => x.type === 'drive').map((x) => ({ coords: x.path, color: x.color, width: focus == null || focus === x.i ? 5 : 4, opacity: focus == null || focus === x.i ? 1 : 0.35 }));
    const pins = segs.filter((x) => x.type === 'stop').map((x) => ({ id: 'p' + x.i, lng: x.lng, lat: x.lat, label: String(x.num) }));
    const all = segs.flatMap((x) => (x.type === 'drive' ? x.path : x.type === 'stop' ? [[x.lng, x.lat]] : []));
    return { segs, routes, pins, all };
  }, [data, focus]);

  const fitTo = useMemo(() => {
    if (!view) return null;
    const sg = focus != null ? view.segs[focus] : null;
    const coords = sg ? (sg.type === 'drive' ? sg.path : [[sg.lng, sg.lat]]) : view.all;
    return { coords, key: `${date}:${focus}:${view.all.length}` };
  }, [view, focus, date]);

  const s = data?.summary;
  return (
    <div className="timeline">
      <div className="tl-map">
        <LiveMap vans={[]} routes={view?.routes} pins={view?.pins} fitTo={fitTo} bottomPad={0.05} />
        <div className="topbar">
          <button className="icon-btn" aria-label="Close timeline" onClick={onClose}><Chevron dir="left" /></button>
        </div>
      </div>
      <section className="tl-sheet">
        <div className="tl-date">
          <button className="icon-btn grey" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><Chevron dir="left" /></button>
          <div>
            <b>{new Date(Date.parse(date + 'T12:00:00+08:00')).toLocaleDateString('en-MY', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' })}</b>
            <span>{date === today ? 'Today' : date === shiftDay(today, -1) ? 'Yesterday' : ' '}</span>
          </div>
          <button className="icon-btn grey" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><Chevron /></button>
        </div>
        {err && <p className="err">{err}</p>}
        {!data && !err && <p className="fine">Loading…</p>}
        {data && (
          <>
            <div className="stats">
              <div><span>Distance</span><b>{fmtKm(s.distanceM)}</b></div>
              <div><span>Driving</span><b>{fmtDur(s.drivingMs)}</b></div>
              <div><span>Stops</span><b>{s.stops}</b></div>
            </div>
            {view.segs.length === 0 && <p className="empty">No trips recorded on this day. Your route is only recorded while you are online.</p>}
            <ol className="tl-list">
              {view.segs.map((sg) => (
                <li key={sg.i} className={'tl-' + sg.type + (focus === sg.i ? ' sel' : '')}>
                  {sg.type === 'stop' && (
                    <button onClick={() => setFocus(focus === sg.i ? null : sg.i)}>
                      <span className="tl-num">{sg.num}</span>
                      <span className="tl-body">
                        <b>{names[`${sg.lat},${sg.lng}`] || 'Stop'}</b>
                        <span>{fmtTime(sg.start)} – {fmtTime(sg.end)}</span>
                      </span>
                      <span className="tl-dur">{fmtDur(sg.end - sg.start)}</span>
                    </button>
                  )}
                  {sg.type === 'drive' && (
                    <button onClick={() => setFocus(focus === sg.i ? null : sg.i)} style={{ '--seg': sg.color }}>
                      <span className="tl-rail" />
                      <span className="tl-body">
                        <span>Drive · {fmtKm(sg.distanceM)} · {fmtDur(sg.end - sg.start)}{sg.avgKmh ? ` · avg ${sg.avgKmh} km/h` : ''}</span>
                        <span className="tl-sub">{fmtTime(sg.start)} – {fmtTime(sg.end)}</span>
                      </span>
                    </button>
                  )}
                  {sg.type === 'gap' && (
                    <div className="tl-gapbox"><span className="tl-rail dashed" /><span className="tl-sub">Offline · {fmtTime(sg.start)} – {fmtTime(sg.end)}</span></div>
                  )}
                </li>
              ))}
            </ol>
            <p className="fine">Only you can see your timeline. History is kept for 90 days.</p>
          </>
        )}
      </section>
    </div>
  );
}
