/**
 * Signature de release stable — le prérequis de toute mise à jour.
 *
 * ## Le problème que ce plugin corrige
 *
 * `android/app/build.gradle` généré par Expo fait pointer `signingConfigs.release`
 * sur `signingConfigs.debug`. Le keystore de debug est créé par Gradle sur la
 * machine qui compile, avec une paire de clés ALÉATOIRE, et `expo prebuild
 * --clean` régénère `android/` à chaque build. Résultat : deux APK successifs
 * ne portent pas la même signature, et Android refuse de voir le second comme
 * une mise à jour du premier (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Il faut
 * désinstaller — donc perdre ses données — à chaque version. C'est aussi ce qui
 * rendait toute mise à jour automatique impossible, G-Store ou pas.
 *
 * ## Ce qu'il fait
 *
 * Si les variables d'environnement sont présentes au prebuild, il écrit un vrai
 * `signingConfigs.release` lisant ses valeurs dans `gradle.properties` :
 *
 *   TWITNINF_KEYSTORE_FILE      chemin absolu du .p12/.jks
 *   TWITNINF_KEYSTORE_PASSWORD  mot de passe du magasin
 *   TWITNINF_KEY_ALIAS          alias de la clé
 *   TWITNINF_KEY_PASSWORD       mot de passe de la clé (par défaut : celui du magasin)
 *
 * Sans elles, il ne touche à rien : un build local sans clé continue de sortir
 * un APK signé debug, comme avant.
 *
 * ⚠️ La clé ne doit JAMAIS changer une fois des utilisateurs installés. La
 * perdre, c'est ne plus pouvoir mettre à jour aucune installation existante.
 */
const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const KEYSTORE_FILE = process.env.TWITNINF_KEYSTORE_FILE;
const KEYSTORE_PASSWORD = process.env.TWITNINF_KEYSTORE_PASSWORD;
const KEY_ALIAS = process.env.TWITNINF_KEY_ALIAS;
const KEY_PASSWORD = process.env.TWITNINF_KEY_PASSWORD || process.env.TWITNINF_KEYSTORE_PASSWORD;

const enabled = Boolean(KEYSTORE_FILE && KEYSTORE_PASSWORD && KEY_ALIAS);

/** Bloc inséré dans `signingConfigs { ... }`, juste après celui de debug. */
const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('TWITNINF_KEYSTORE_FILE')) {
                storeFile file(TWITNINF_KEYSTORE_FILE)
                storePassword TWITNINF_KEYSTORE_PASSWORD
                keyAlias TWITNINF_KEY_ALIAS
                keyPassword TWITNINF_KEY_PASSWORD
                // v3 en plus de v2 : c'est le schéma qui permettra une rotation
                // de clé plus tard sans casser les installations existantes.
                enableV2Signing true
                enableV3Signing true
            }
        }`;

function withSigningGradle(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!enabled) return mod;
    let contents = mod.modResults.contents;

    // 1. Déclarer le signingConfig `release` à côté de `debug`.
    if (!contents.includes('TWITNINF_KEYSTORE_FILE')) {
      contents = contents.replace(
        /signingConfigs\s*\{/,
        (match) => `${match}${RELEASE_SIGNING_CONFIG}`
      );
    }

    // 2. Faire pointer le buildType release dessus. Expo écrit
    //    `signingConfig signingConfigs.debug` dans le bloc release — c'est
    //    exactement cette ligne qu'il faut reprendre, et seulement celle du
    //    bloc release (celle du bloc debug doit rester).
    contents = contents.replace(
      /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release'
    );

    mod.modResults.contents = contents;
    return mod;
  });
}

function withSigningProperties(config) {
  return withGradleProperties(config, (mod) => {
    if (!enabled) return mod;
    const entries = {
      TWITNINF_KEYSTORE_FILE: KEYSTORE_FILE.replace(/\\/g, '/'),
      TWITNINF_KEYSTORE_PASSWORD: KEYSTORE_PASSWORD,
      TWITNINF_KEY_ALIAS: KEY_ALIAS,
      TWITNINF_KEY_PASSWORD: KEY_PASSWORD,
    };

    for (const [key, value] of Object.entries(entries)) {
      const existing = mod.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
}

module.exports = function withReleaseSigning(config) {
  return withSigningProperties(withSigningGradle(config));
};
