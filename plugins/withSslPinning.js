/**
 * Expo Config Plugin: withSslPinning
 *
 * Épinglage de certificat (« SSL pinning ») posé AU BUILD, sur les deux
 * plateformes, sans une ligne de code natif ni de bibliothèque tierce :
 *
 *   - Android → `res/xml/network_security_config.xml` + l'attribut
 *     `android:networkSecurityConfig` sur `<application>` ;
 *   - iOS     → `NSAppTransportSecurity.NSPinnedDomains` dans `Info.plist`.
 *
 * Les deux mécanismes sont ceux du SYSTÈME. Ils s'appliquent donc à tout ce qui
 * passe par la pile réseau native — `fetch`, `XMLHttpRequest`, les WebSockets
 * de socket.io, le chargement des images — sans qu'aucun appel n'ait à être
 * réécrit, et sans qu'un appel oublié échappe à la règle. C'est précisément ce
 * qu'une bibliothèque JS d'épinglage ne sait pas garantir.
 *
 * Un plugin plutôt qu'une retouche à la main : les deux workflows CI lancent
 * `expo prebuild --clean`, qui supprime et régénère `android/` (voir
 * `withGoogleMapsApiKey.js`, même piège, déjà payé une fois).
 *
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  CE QUI EST ÉPINGLÉ, ET POURQUOI PAS LE CERTIFICAT DU SERVEUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ce sont les RACINES ISRG (Let's Encrypt) qui sont épinglées, plus
 * l'intermédiaire courant — jamais la clé du certificat de `api.twitninf.fr`.
 *
 * La raison est vérifiable sur le VPS : aucune des configurations de
 * renouvellement de `/etc/letsencrypt/renewal/*.conf` ne porte `reuse_key`.
 * Certbot fabrique donc une clé NEUVE à chaque renouvellement — l'archive du
 * certificat principal montre déjà `privkey1.pem` puis `privkey2.pem`. Une
 * empreinte de la clé du serveur cesserait d'être valable au premier
 * renouvellement (les certificats courants expirent le 26/11/2026, donc
 * renouvellement automatique vers la fin octobre) et TOUTES les applications
 * installées perdraient l'accès à l'API le même jour, d'un coup.
 *
 * Or cette application se distribue en sideload (AltStore / Kospor sur iOS,
 * G-Store sur Android) : il n'y a pas de bouton « mise à jour immédiate » à
 * actionner pour réparer un parc bloqué. Le mode de panne est donc trop
 * coûteux pour le gain.
 *
 * Ce que l'épinglage des racines apporte quand même : l'ensemble des autorités
 * acceptées passe d'environ cent cinquante à UNE. Un certificat mal émis par
 * n'importe quelle autre autorité publique, un proxy d'entreprise, un
 * intercepteur qui aurait fait installer sa propre autorité — tout cela est
 * refusé. Ce qu'il n'arrête pas : un attaquant capable de faire émettre un
 * vrai certificat Let's Encrypt pour le domaine (détournement DNS chez
 * DuckDNS/OVH). Épingler plus bas dans la chaîne le bloquerait aussi, au prix
 * du mode de panne décrit ci-dessus — c'est l'arbitrage, il est réversible :
 * il suffit de changer `pins` dans `app.config.js`.
 *
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  LES TROIS GARDE-FOUS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. **`u.expo.dev` n'est JAMAIS épinglé.** C'est l'hôte des mises à jour OTA,
 *    et c'est la seule porte de sortie si les empreintes deviennent fausses.
 *
 *    Attention à ne pas se tromper sur ce qu'elle permet : une mise à jour OTA
 *    ne remplace PAS la configuration native, donc elle ne peut pas corriger
 *    les empreintes elles-mêmes — seul un nouveau build natif le peut, et il
 *    faut le refaire installer à la main. Ce qu'elle peut faire, c'est
 *    republier un `EXPO_PUBLIC_API_URL` pointant un hôte ABSENT de la liste
 *    ci-dessous, sur lequel l'épinglage ne s'applique donc pas : le service
 *    revient le temps de préparer le vrai correctif. C'est la raison d'être de
 *    ce garde-fou — ne jamais ajouter `u.expo.dev` à `domains`.
 *
 * 2. **Une date d'expiration sur le `pin-set` Android.** Passé cette date,
 *    Android cesse d'appliquer l'épinglage au lieu de refuser la connexion.
 *    C'est une soupape volontaire : une application oubliée sur un téléphone
 *    continue de fonctionner au lieu de mourir en silence. iOS n'a pas
 *    d'équivalent — d'où l'importance de n'épingler que des racines à très
 *    longue durée de vie (2035 et 2040).
 *
 * 3. **`debug-overrides`** rend les autorités installées par l'utilisateur
 *    valables dans les builds débogables UNIQUEMENT. Sans lui, plus aucun
 *    Charles/mitmproxy ne fonctionne en développement. Android ignore ce bloc
 *    dans un build de release : il ne peut pas servir de contournement.
 *
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  VÉRIFIER LES EMPREINTES AVANT DE LES CROIRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Une empreinte recopiée d'un article de blog est un pari. Elles se
 * recalculent en une commande, et la sortie doit contenir chacune des valeurs
 * de `DEFAULT_PINS` :
 *
 *   echo | openssl s_client -connect api.twitninf.fr:443 \
 *          -servername api.twitninf.fr -showcerts 2>/dev/null \
 *     | awk '/BEGIN CERT/,/END CERT/' > /tmp/chain.pem
 *   csplit -sz -f /tmp/c- /tmp/chain.pem '/BEGIN CERT/' '{*}'
 *   for f in /tmp/c-*; do
 *     openssl x509 -in "$f" -noout -subject
 *     openssl x509 -in "$f" -pubkey -noout \
 *       | openssl pkey -pubin -outform der \
 *       | openssl dgst -sha256 -binary | openssl enc -base64
 *   done
 *
 * À refaire avant toute release : si Let's Encrypt change de chaîne et
 * qu'aucune empreinte ne correspond plus, le build partirait cassé.
 */
const {
  withAndroidManifest,
  withInfoPlist,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Empreintes SHA-256 de la clé publique (SPKI), en base64 — le format exigé
 * tel quel par Android (`<pin digest="SHA-256">`) et par iOS
 * (`SPKI-SHA256-BASE64`).
 *
 * Relevées le 2026-08-30 sur la chaîne réellement servie par
 * `api.twitninf.fr`, et recoupées avec les fichiers publiés par
 * letsencrypt.org pour les deux racines.
 *
 * Il en faut PLUSIEURS, et c'est le point le plus important de cette liste.
 * Android comme iOS acceptent la connexion dès qu'UN certificat de la chaîne
 * correspond à UNE empreinte. Une liste à une seule entrée signifie donc :
 * « le jour où l'autorité change quoi que ce soit, l'application meurt ».
 * Les quatre entrées ci-dessous couvrent les deux racines actuellement
 * servies, la racine historique X1 (encore utilisée en signature croisée pour
 * les vieux appareils) et l'intermédiaire courant.
 */
const DEFAULT_PINS = [
  // ISRG Root X1 — expire le 04/06/2035. Signature croisée des anciens appareils.
  'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=',
  // ISRG Root X2 — expire le 17/09/2040.
  'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=',
  // « Root YE » — racine ISRG servie dans la chaîne actuelle, expire en 2032.
  'sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=',
  // Intermédiaire Let's Encrypt YE1 — expire le 02/09/2028.
  'brzvtCELCIZUo4sD/qPX0ccRtPsd3DY6RfmxpOU9oB4=',
];

/**
 * Domaines couverts, sous-domaines inclus — `twitninf.fr` couvre donc `api.`,
 * `stream.` et `web.`, qui portent trois certificats différents mais la même
 * chaîne d'autorité. Les noms DuckDNS sont les mêmes hôtes sous leur nom
 * d'origine : ils partagent les certificats (voir `domaine-twitninf-fr`).
 */
const DEFAULT_DOMAINS = ['twitninf.fr', 'twitninf.duckdns.org'];

/**
 * Soupape Android. Volontairement lointaine mais pas infinie : elle doit
 * survivre largement à un parc qui ne se met pas à jour, sans devenir un
 * épinglage éternel qu'on aurait oublié d'entretenir.
 */
const DEFAULT_EXPIRATION = '2028-06-01';

const RES_FILE = 'network_security_config.xml';
const RES_REF = '@xml/network_security_config';

function buildAndroidXml({ domains, pins, expiration }) {
  const pinTags = pins.map((p) => `      <pin digest="SHA-256">${p}</pin>`).join('\n');
  const domainTags = domains
    .map((d) => `    <domain includeSubdomains="true">${d}</domain>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  GÉNÉRÉ PAR plugins/withSslPinning.js — ne pas éditer à la main.
  "expo prebuild --clean" régénère tout le dossier android/ : une retouche
  faite ici disparaîtrait au prochain build, sans le moindre avertissement.
-->
<network-security-config>
  <!--
    "cleartextTrafficPermitted="false"" est répété ici parce que déclarer un
    "networkSecurityConfig" REMPLACE l'attribut "android:usesCleartextTraffic"
    du manifeste (posé par expo-build-properties). Sans cette ligne, poser
    l'épinglage rouvrirait le HTTP en clair — l'inverse exact du but.
  -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>

  <domain-config cleartextTrafficPermitted="false">
${domainTags}
    <!--
      Passé "expiration", Android cesse d'appliquer l'épinglage au lieu de
      refuser la connexion : une application oubliée sur un téléphone continue
      de fonctionner plutôt que de mourir en silence.
    -->
    <pin-set expiration="${expiration}">
${pinTags}
    </pin-set>
  </domain-config>

  <!--
    Builds DÉBOGABLES uniquement — Android ignore ce bloc en release, il ne
    peut donc pas servir de contournement. Sans lui, aucun proxy d'inspection
    ne fonctionne plus en développement.
  -->
  <debug-overrides>
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </debug-overrides>
</network-security-config>
`;
}

const withSslPinning = (config, options = {}) => {
  const pins = options.pins ?? DEFAULT_PINS;
  const domains = options.domains ?? DEFAULT_DOMAINS;
  const expiration = options.expiration ?? DEFAULT_EXPIRATION;

  // Une liste vide passerait sans bruit et laisserait un build NON épinglé
  // qu'on croirait protégé. Mieux vaut casser le prebuild.
  if (!pins.length) {
    throw new Error('[ssl-pinning] Aucune empreinte : le build serait non épinglé.');
  }
  if (pins.length < 2) {
    console.warn(
      '[ssl-pinning] ⚠️  Une seule empreinte. Sans empreinte de secours, tout '
        + "changement de chaîne côté autorité coupe l'accès à l'API pour tout le parc.",
    );
  }

  // ── Android : le fichier de ressource ──────────────────────────────────
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, RES_FILE),
        buildAndroidXml({ domains, pins, expiration }),
        'utf8',
      );
      return cfg;
    },
  ]);

  // ── Android : la référence dans le manifeste ───────────────────────────
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:networkSecurityConfig'] = RES_REF;
    return cfg;
  });

  // ── iOS : NSPinnedDomains ──────────────────────────────────────────────
  config = withInfoPlist(config, (cfg) => {
    const ats = cfg.modResults.NSAppTransportSecurity ?? {};
    const pinned = {};

    for (const domain of domains) {
      pinned[domain] = {
        NSIncludesSubdomains: true,
        // `NSPinnedCAIdentities` et non `NSPinnedLeafIdentities` : ce sont des
        // autorités qu'on épingle, pas le certificat du serveur. Se tromper de
        // clé ici rendrait l'épinglage silencieusement inopérant — Apple ne
        // signale pas une clé inconnue.
        NSPinnedCAIdentities: pins.map((p) => ({ 'SPKI-SHA256-BASE64': p })),
      };
    }

    cfg.modResults.NSAppTransportSecurity = { ...ats, NSPinnedDomains: pinned };
    return cfg;
  });

  return config;
};

module.exports = withSslPinning;
module.exports.DEFAULT_PINS = DEFAULT_PINS;
module.exports.DEFAULT_DOMAINS = DEFAULT_DOMAINS;
