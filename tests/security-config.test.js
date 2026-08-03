const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const appConfig = require('../app.config.js')({ config: {} });
const releaseManifest = readFileSync(
  'android/app/src/main/AndroidManifest.xml',
  'utf8',
);

test('release Android configuration blocks cleartext and backups', () => {
  assert.equal(appConfig.android.allowBackup, false);
  const buildProperties = appConfig.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  assert.equal(buildProperties[1].android.usesCleartextTraffic, false);
  assert.match(releaseManifest, /android:allowBackup="false"/);
  assert.match(releaseManifest, /android:usesCleartextTraffic="false"/);
});

test('release Android configuration applies least privilege', () => {
  for (const permission of [
    'ACCESS_COARSE_LOCATION',
    'ACCESS_FINE_LOCATION',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
    'SYSTEM_ALERT_WINDOW',
  ]) {
    assert.doesNotMatch(releaseManifest, new RegExp(`android.permission.${permission}`));
    assert.ok(!appConfig.android.permissions.includes(permission));
  }
});
