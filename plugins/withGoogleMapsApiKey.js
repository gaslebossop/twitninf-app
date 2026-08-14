/**
 * Expo Config Plugin: withGoogleMapsApiKey
 *
 * Injecte la clé Google Maps Android dans le manifeste, au moment du prebuild.
 *
 * ## Pourquoi un plugin et pas une ligne écrite à la main
 *
 * `react-native-maps` est volontairement figé à 1.20.1 (voir app.config.js) et
 * cette version n'a pas de config plugin. La consigne était donc d'ajouter la
 * balise `<meta-data android:name="com.google.android.geo.API_KEY">` à la main
 * dans `android/app/src/main/AndroidManifest.xml`.
 *
 * Sauf que les deux workflows CI lancent `npx expo prebuild --platform android
 * --clean`, qui SUPPRIME et régénère tout le dossier `android/`. Toute retouche
 * manuelle du manifeste est donc effacée à chaque build — et comme l'absence de
 * clé ne produit aucune erreur JS, la Carte NF se rendait en simple rectangle
 * gris dans l'APK, sans le moindre signe dans les logs. C'est exactement le
 * genre de panne qu'un plugin, lui, ne peut pas subir : il rejoue à chaque
 * prebuild.
 *
 * ## Renseigner la clé
 *
 * La clé vit dans `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` (fichier `.env` en
 * local, secret de dépôt côté CI — voir `.env.example`). Sans elle le plugin ne
 * fait rien et prévient dans la sortie du build : mieux vaut un avertissement
 * lisible qu'une carte grise inexpliquée.
 *
 * Aucun équivalent iOS n'est nécessaire : Apple Maps ne demande pas de clé.
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const META_DATA_NAME = 'com.google.android.geo.API_KEY';

const withGoogleMapsApiKey = (config) => {
  return withAndroidManifest(config, (config) => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;

    if (!apiKey) {
      console.warn(
        `[withGoogleMapsApiKey] EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY absent — ` +
          `la Carte NF s'affichera en rectangle gris sur Android.`,
      );
      return config;
    }

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      META_DATA_NAME,
      apiKey,
    );

    return config;
  });
};

module.exports = withGoogleMapsApiKey;
