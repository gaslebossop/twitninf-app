module.exports = ({ config }) => {
  // Configuration de base
  const baseConfig = {
    ...config,
    name: "TwitNinf",
    slug: "twitninf-v2",
    version: "1.0.0",
    privacy: "public",
    orientation: "portrait",
    runtimeVersion: "1.0.0",
    // Retour de la connexion G (voir services/gAuthLogin.ts). N'existe que
    // dans un build natif — Expo Go possède déjà son propre schéma exp:// et
    // ignore celui-ci, d'où le calcul dynamique via `Linking.createURL()`
    // plutôt qu'un twitninf:// codé en dur côté client.
    scheme: "twitninf",
    updates: {
      url: "https://u.expo.dev/5370e501-b1a8-4999-bc98-83194b608a8e"
    },
    icon: "./assets/icon.png",
    // « light » forçait `UIUserInterfaceStyle` à Light : `Appearance
    // .getColorScheme()` renvoyait alors toujours 'light', quel que soit le
    // réglage du téléphone. L'option « Système » de l'écran Thème (voir
    // src/theme/themePreference.ts) ne pouvait donc JAMAIS donner du sombre, et
    // les vues natives (clavier, feuilles d'action) s'affichaient en clair
    // par-dessus une app sombre.
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      // Aligné sur `colors.bg` du thème sombre, qui est le thème par défaut
      // (themePreference.loadThemePreference). Un fond blanc ici produisait un
      // flash blanc plein écran entre l'écran de démarrage et le premier rendu.
      backgroundColor: "#0A0A0A"
    },
    ios: {
      // Obligatoire pour `expo prebuild` : Expo ne peut pas l'ecrire lui-meme
      // dans une config dynamique (.js) et echoue sans elle. Aligne sur le
      // `package` Android ci-dessous.
      bundleIdentifier: "com.gasleboss.TwitNin",
      supportsTablet: true,
      deploymentTarget: "15.1",
      infoPlist: {
        NSCameraUsageDescription: "L'application a besoin d'accéder à la caméra pour diffuser en direct.",
        NSMicrophoneUsageDescription: "L'application a besoin d'accéder au microphone pour diffuser en direct.",
        // Décrit les DEUX usages, y compris la Carte NF. Apple refuse une
        // description qui ne couvre pas l'usage réel, et c'est ce texte que
        // l'utilisateur lit avant d'accepter : le partage sur une carte ne
        // pouvait pas rester caché derrière « statistiques agrégées ».
        NSLocationWhenInUseUsageDescription: "TwitNinf utilise votre position pour les statistiques géographiques agrégées et la sécurité des sessions, et — uniquement si vous l'activez — pour vous afficher sur la Carte NF auprès des comptes liés à vous. Le partage sur la carte est désactivé par défaut et s'efface automatiquement.",
        // Sans cette clé, iOS plafonne l'app à 60 fps sur les écrans ProMotion,
        // quel que soit le travail d'optimisation fait côté JS. Elle n'a d'effet
        // que dans un build natif : Expo Go reste à 60 fps.
        CADisableMinimumFrameDurationOnPhone: true
      }
    },
    android: {
      // Les sauvegardes Android ne doivent jamais pouvoir exporter les
      // informations de session ou les caches privés de l'application.
      allowBackup: false,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.gasleboss.TwitNin",
      /**
       * Même compteur que côté iOS : le `buildVersion` du gist AltStore, lu
       * AVANT le bundling et injecté en `EXPO_PUBLIC_BUILD_VERSION` (voir
       * `.github/workflows/android-build.yml` et `tools/build-twitninf.sh` de
       * G-Store). Une seule source de vérité pour les deux plateformes.
       *
       * Sans ce champ, Expo posait `versionCode: 1` à CHAQUE build : deux APK
       * successifs sortaient avec le même numéro, et aucun store — G-Store
       * compris — ne pouvait détecter une mise à jour.
       */
      versionCode: Number(process.env.EXPO_PUBLIC_BUILD_VERSION) || 1,
      /**
       * App Links : un lien https://twitninf.fr/tweet/… ouvre l'APP au lieu du
       * navigateur.
       *
       * `autoVerify` n'est qu'une demande : Android ne l'accorde que s'il
       * trouve `https://<host>/.well-known/assetlinks.json` contenant
       * l'empreinte SHA-256 du certificat qui a signé l'APK installé. Si le
       * build repart sur la mauvaise clé (voir l'incident de signature du
       * 2026-08-17), la vérification échoue en silence et les liens
       * retournent au navigateur.
       */
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: [
            { scheme: "https", host: "twitninf.fr", pathPrefix: "/tweet" },
            { scheme: "https", host: "twitninf.fr", pathPrefix: "/profile" },
            { scheme: "https", host: "www.twitninf.fr", pathPrefix: "/tweet" },
            { scheme: "https", host: "www.twitninf.fr", pathPrefix: "/profile" }
          ]
        }
      ],
      useNextNotificationsApi: true,
      permissions: [
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "CAMERA",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "POST_NOTIFICATIONS"
      ],
      // `permissions` ci-dessus ne fait qu'AJOUTER : les bibliothèques
      // fusionnent les leurs dans le manifeste, et trois permissions larges
      // arrivaient ainsi sans que personne les demande — le manifeste généré
      // les portait toutes les trois (voir tests/security-config.test.js, qui
      // échouait dessus).
      //
      // - READ/WRITE_EXTERNAL_STORAGE viennent d'expo-media-library. L'app ne
      //   fait qu'y LIRE une vignette (RecordVideoScreen), couverte par
      //   READ_MEDIA_IMAGES/VIDEO sur Android 13+ ; rien n'écrit dans la
      //   photothèque. Sur Android 12 et avant, la vignette retombe sur
      //   l'icône par défaut — le code teste déjà `granted`.
      // - SYSTEM_ALERT_WINDOW (dessiner par-dessus les autres applications)
      //   est tiré par les libs vidéo pour un mode PiP que l'app n'utilise
      //   pas. C'est la permission la plus alarmante de la liste du Play
      //   Store pour un réseau social.
      blockedPermissions: [
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW"
      ]
    },
    // Valeurs écrites dans le thème natif Android, donc appliquées AVANT que
    // le premier rendu JS ne pose sa propre <StatusBar>. Sans elles, Expo
    // laissait une barre d'état blanche par-dessus un écran de démarrage
    // désormais sombre.
    androidStatusBar: {
      barStyle: "light-content",
      backgroundColor: "#0A0A0A",
      translucent: false
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      eas: {
        projectId: "5370e501-b1a8-4999-bc98-83194b608a8e"
      }
    },
    owner: "gaspirouu"
  };

  // Configuration des plugins pour tous les environnements
  baseConfig.plugins = [
    "./plugins/withPodfileSwift5",
    // Injecte la clé Google Maps à chaque prebuild — voir le plugin pour
    // pourquoi la ligne écrite à la main dans le manifeste ne tenait pas.
    "./plugins/withGoogleMapsApiKey",
    // Signature de release stable — sans elle, chaque build porte une clé
    // aléatoire et Android refuse la mise à jour de l'APK précédent.
    "./plugins/withReleaseSigning",
    "expo-secure-store",
    "expo-web-browser",
    // ⚠️ PAS de plugin "expo-camera" ici, et c'est délibéré.
    //
    // Le seul rôle de ce plugin est de DÉCLARER les permissions caméra. Elles
    // le sont déjà : `CAMERA` dans `android.permissions` ci-dessus (le live la
    // demandait avant le contrôle des places), et `NSCameraUsageDescription` /
    // `NSMicrophoneUsageDescription` dans `ios.infoPlist`, rédigées pour ce que
    // l'utilisateur lit vraiment avant d'accepter.
    //
    // Or les mods d'un plugin s'appliquent APRÈS `ios.infoPlist` : ajouter
    // "expo-camera" sans lui repasser explicitement nos deux chaînes écraserait
    // les descriptions françaises par les valeurs anglaises par défaut de la
    // bibliothèque — sans erreur, et sans que rien ne se voie avant qu'Apple ne
    // le relève. Le module fonctionne sans son plugin dès lors que les
    // permissions existent.
    [
      "expo-location",
      {
        locationWhenInUsePermission: "TwitNinf utilise votre position une fois par connexion, avec votre accord, pour les statistiques géographiques agrégées et la sécurité des sessions."
      }
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#000000",
        mode: "production"
      }
    ],
    [
      "expo-build-properties",
      {
        android: {
          // Les jetons Bearer ne doivent jamais pouvoir transiter en HTTP.
          usesCleartextTraffic: false,
          compileSdkVersion: 35,
          targetSdkVersion: 34,
          buildToolsVersion: "35.0.0",
          // Minification + élagage des ressources en release : le build
          // livrait jusqu'ici du code non minifié et toutes les ressources,
          // ce qui alourdit l'APK et le temps de démarrage.
          enableProguardInReleaseBuilds: true,
          enableSeparateBuildPerCPUArchitecture: false,
          enableShrinkResources: true,
          // slf4j regarde reflectivement une classe de binding de log qui
          // n'est jamais presente sur Android (aucune lib ne l'embarque) —
          // c'est un no-op normal a l'execution, mais R8 en mode strict
          // refuse de compiler tant qu'une classe referencee est absente du
          // classpath sans regle explicite pour l'ignorer.
          extraProguardRules: "-dontwarn org.slf4j.**",
          // Permissions de notifications Android
          permissions: [
            "INTERNET",
            "ACCESS_NETWORK_STATE",
            "CAMERA",
            "ACCESS_COARSE_LOCATION",
            "ACCESS_FINE_LOCATION",
            "POST_NOTIFICATIONS",
            "VIBRATE",
            "WAKE_LOCK"
          ]
        },
        ios: {
          // Configuration iOS pour les notifications
          deploymentTarget: "15.1"
        }
      }
    ],
    // ⚠️ PAS de plugin "react-native-maps" ici.
    //
    // La bibliothèque est volontairement maintenue à 1.20.1, la version que
    // contient Expo Go SDK 54 : Expo Go embarque des modules natifs figés, et
    // toute autre version fait échouer l'app au démarrage sur
    // « 'RNMapsAirModule' could not be found ». Or le plugin de configuration
    // n'existe qu'à partir de 1.22.0 — l'ajouter ferait échouer Expo au
    // chargement de ce fichier.
    //
    // Conséquence pour Android : la clé Google Maps ne peut pas passer par le
    // plugin de react-native-maps. Elle est injectée par
    // `./plugins/withGoogleMapsApiKey` (déclaré en tête de cette liste), qui la
    // lit dans EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY.
    //
    // La consigne précédente — écrire la balise <meta-data> à la main dans
    // `android/app/src/main/AndroidManifest.xml` — ne pouvait pas tenir : les
    // deux workflows CI lancent `expo prebuild --clean`, qui régénère tout le
    // dossier `android/` et efface la retouche. Sans clé, la carte se rend en
    // rectangle gris uni sur Android, sans la moindre erreur JS.
    // Aucun impact sur iOS : Apple Maps ne demande rien.
    "react-native-video",
    // Config plugin de la lib de live : injecte les podspecs HaishinKit
    // vendorisés dans le Podfile généré. Nos chaînes NSCameraUsageDescription
    // / NSMicrophoneUsageDescription vivent déjà dans ios.infoPlist ci-dessus,
    // donc pas d'options ici — le plugin ne touche pas l'Info.plist tant
    // qu'on ne lui passe pas explicitement cameraUsage/microphoneUsage.
    "react-native-nitro-rtmp-publisher"
  ];

  // Configuration des notifications
  baseConfig.notification = {
    icon: "./assets/icon.png",
    color: "#000000",
    iosDisplayInForeground: true,
    androidMode: "default",
    androidCollapsedTitle: "Nouvelle notification",
    androidChannelId: "default",
    androidChannelName: "Notifications générales",
    androidChannelDescription: "Notifications de l'application TwitNinf"
  };

  return baseConfig;
};
