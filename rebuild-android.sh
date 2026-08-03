#!/bin/bash

echo "🚀 Démarrage de la reconstruction Android..."

# Nettoyer le cache Expo
echo "🧹 Nettoyage du cache Expo..."
npx expo start --clear --no-dev --minify

# Attendre que le serveur démarre
echo "⏳ Attente du démarrage du serveur..."
sleep 5

# Nettoyer le cache Metro
echo "🧹 Nettoyage du cache Metro..."
npx react-native start --reset-cache

# Alternative: Rebuild complet avec EAS
echo "🔨 Build complet avec EAS..."
echo "Pour un build complet, exécutez:"
echo "eas build --platform android --profile development --clear-cache"

echo "✅ Reconstruction terminée!"
echo ""
echo "📱 Instructions:"
echo "1. Fermez complètement l'application sur votre appareil"
echo "2. Désinstallez l'ancienne version si nécessaire"
echo "3. Installez la nouvelle version"
echo "4. Testez la connexion réseau"
