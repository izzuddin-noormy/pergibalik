'use client';
// Location abstraction: native (Capacitor APK) or plain browser.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

export const isNative = () => Capacitor.isNativePlatform();

function norm(p) {
  // Normalise both Capacitor/Browser position and background-geolocation shape.
  const c = p.coords || p;
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy ?? null,
    speed: c.speed ?? null, // m/s
    heading: c.heading ?? c.bearing ?? null,
    time: p.timestamp || p.time || Date.now(),
  };
}

/** Ask for location permission. Returns 'granted' | 'denied'. */
export async function requestLocationPermission() {
  if (isNative()) {
    try {
      const r = await Geolocation.requestPermissions({ permissions: ['location'] });
      return r.location === 'granted' || r.coarseLocation === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  if (!('geolocation' in navigator)) return 'denied';
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (e) => resolve(e.code === 1 ? 'denied' : 'granted'),
      { timeout: 15000 }
    )
  );
}

export async function checkLocationPermission() {
  try {
    if (isNative()) {
      const r = await Geolocation.checkPermissions();
      return r.location === 'granted' || r.coarseLocation === 'granted' ? 'granted' : r.location;
    }
    if (navigator.permissions) {
      const s = await navigator.permissions.query({ name: 'geolocation' });
      return s.state;
    }
  } catch {}
  return 'prompt';
}

/** Foreground watch (riders). Returns a stop function. */
export async function watchForeground(onPos, onErr) {
  if (isNative()) {
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000 }, (p, err) => {
      if (err) onErr?.(err);
      else if (p) onPos(norm(p));
    });
    return () => Geolocation.clearWatch({ id });
  }
  const id = navigator.geolocation.watchPosition((p) => onPos(norm(p)), (e) => onErr?.(e), {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  });
  return () => navigator.geolocation.clearWatch(id);
}

/** Driver tracking: keeps running with screen off in the APK (foreground service). */
export async function startDriverTracking(onPos, onErr) {
  if (isNative()) {
    try {
      await LocalNotifications.requestPermissions(); // Android 13+: needed for the tracking notification
    } catch {}
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'PergiBalik: sharing your van location',
        backgroundMessage: 'Riders can see your van. Go offline in the app to stop.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10,
      },
      (loc, err) => {
        if (err) {
          if (err.code === 'NOT_AUTHORIZED') onErr?.({ code: 1, message: 'Location permission denied' });
          else onErr?.(err);
          return;
        }
        if (loc) onPos(norm(loc));
      }
    );
    return () => BackgroundGeolocation.removeWatcher({ id });
  }
  return watchForeground(onPos, onErr);
}

export async function openAppSettings() {
  if (isNative()) {
    try { await BackgroundGeolocation.openSettings(); } catch {}
  }
}
