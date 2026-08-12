# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# react-native-maps / SDK Google Maps (Carte NF)
#
# Le build de release active `enableProguardInReleaseBuilds` ET
# `enableShrinkResources` (voir app.config.js). R8 élague alors des classes que
# le SDK Google Maps n'atteint que par réflexion : l'app tombe côté natif, en
# release uniquement, SANS aucune trace côté JS — impossible à relier à la
# carte sans ces règles. Ne pas retirer.
-keep class com.google.android.gms.maps.** { *; }
-keep interface com.google.android.gms.maps.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keep class com.google.maps.android.** { *; }
-keep class com.rnmaps.maps.** { *; }
# Nom du paquet avant le renommage de la bibliothèque : les deux coexistent
# selon les versions, garder les deux ne coûte rien.
-keep class com.airbnb.android.react.maps.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.rnmaps.maps.**

# Add any project specific keep options here:
