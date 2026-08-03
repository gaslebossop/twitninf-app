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
        // DIAGNOSTIC TEMPORAIRE : isoler si ATS bloque la connexion sur le
        // build unsigned (Safari/Expo Go n'appliquent pas les mêmes règles
        // ATS qu'un binaire compilé). À retirer dès la cause confirmée.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true
        }
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
