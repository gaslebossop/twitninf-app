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
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
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
      useNextNotificationsApi: true,
      permissions: [
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "CAMERA",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "POST_NOTIFICATIONS"
      ]
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
    "expo-secure-store",
    "expo-web-browser",
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
    // Conséquence pour Android : la clé Google Maps ne peut pas passer par un
    // plugin. Elle doit être écrite à la main dans
    // `android/app/src/main/AndroidManifest.xml` :
    //   <meta-data android:name="com.google.android.geo.API_KEY"
    //              android:value="..." />
    // Sans elle, la carte se rend en rectangle gris uni sur Android, sans la
    // moindre erreur JS. Aucun impact sur iOS : Apple Maps ne demande rien.
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
