const test = require('node:test');
const assert = require('node:assert/strict');
const { AndroidConfig } = require('@expo/config-plugins');

const withGoogleMapsApiKey = require('../plugins/withGoogleMapsApiKey');

const MANIFEST_PATH = 'android/app/src/main/AndroidManifest.xml';
const META_DATA_NAME = 'com.google.android.geo.API_KEY';

/**
 * Rejoue le plugin sur le vrai manifeste du dépôt.
 *
 * `withAndroidManifest` ne fait qu'enregistrer une fonction dans
 * `mods.android.manifest` ; c'est `expo prebuild` qui l'exécute plus tard, avec
 * le manifeste analysé dans `modResults`. On reproduit ici cet appel, plutôt
 * que de tester une copie du plugin : ce qui compte est qu'il produise bien la
 * balise sur la structure réelle.
 */
async function applyPlugin(apiKey) {
  const previous = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  if (apiKey === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  else process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY = apiKey;

  try {
    const config = withGoogleMapsApiKey({ name: 'TwitNinf', slug: 'twitninf-v2' });
    const modResults = await AndroidConfig.Manifest.readAndroidManifestAsync(MANIFEST_PATH);
    const result = await config.mods.android.manifest({ ...config, modResults, modRequest: {} });
    return result.modResults;
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
    else process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY = previous;
  }
}

function findMapsKey(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const item = (application['meta-data'] || []).find(
    (entry) => entry.$['android:name'] === META_DATA_NAME,
  );
  return item ? item.$['android:value'] : null;
}

test('la clé Google Maps est injectée dans le manifeste au prebuild', async () => {
  const manifest = await applyPlugin('AIza-cle-de-test');
  assert.equal(findMapsKey(manifest), 'AIza-cle-de-test');
});

test('sans clé configurée, le plugin laisse le manifeste intact', async () => {
  const manifest = await applyPlugin(undefined);
  assert.equal(findMapsKey(manifest), null);
});

test('le manifeste versionné ne contient aucune clé écrite en dur', async () => {
  // La clé est un secret : elle vient de l'environnement, jamais du dépôt —
  // qui est public.
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(MANIFEST_PATH);
  assert.equal(findMapsKey(manifest), null);
});
