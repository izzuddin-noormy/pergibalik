// Adds location permissions + notification settings to the generated Android project.
import fs from 'node:fs';
const mf = 'android/app/src/main/AndroidManifest.xml';
let x = fs.readFileSync(mf, 'utf8');
const perms = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
];
const add = perms.filter((p) => !x.includes(`"${p}"`)).map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
if (add) x = x.replace('</manifest>', `${add}\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>`);
fs.writeFileSync(mf, x);

const sx = 'android/app/src/main/res/values/strings.xml';
let s = fs.readFileSync(sx, 'utf8');
if (!s.includes('capacitor_background_geolocation_notification_channel_name')) {
  s = s.replace('</resources>',
`    <string name="capacitor_background_geolocation_notification_channel_name">Van location sharing</string>
    <string name="capacitor_background_geolocation_notification_color">#111111</string>
    <string name="capacitor_background_geolocation_notification_icon">drawable/ic_tracking</string>
</resources>`);
  fs.writeFileSync(sx, s);
}
// App name + icons: icons live in scripts/brand-res.tgz (extract into android/app/src/main/)
let st = fs.readFileSync(sx, 'utf8').replace(/>Shuttle</g, '>PergiBalik<');
fs.writeFileSync(sx, st);
console.log('Android project patched');
