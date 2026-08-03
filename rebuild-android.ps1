# Script PowerShell pour reconstruire l'application Android

Write-Host "🚀 Démarrage de la reconstruction Android..." -ForegroundColor Green

# Nettoyer le cache Expo
Write-Host "🧹 Nettoyage du cache Expo..." -ForegroundColor Yellow
npx expo start --clear --no-dev --minify

# Attendre que le serveur démarre
Write-Host "⏳ Attente du démarrage du serveur..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Nettoyer le cache Metro
Write-Host "🧹 Nettoyage du cache Metro..." -ForegroundColor Yellow
npx react-native start --reset-cache

# Alternative: Rebuild complet avec EAS
Write-Host "🔨 Build complet avec EAS..." -ForegroundColor Yellow
Write-Host "Pour un build complet, exécutez:" -ForegroundColor Cyan
Write-Host "eas build --platform android --profile development --clear-cache" -ForegroundColor White

Write-Host "✅ Reconstruction terminée!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Instructions:" -ForegroundColor Cyan
Write-Host "1. Fermez complètement l'application sur votre appareil" -ForegroundColor White
Write-Host "2. Désinstallez l'ancienne version si nécessaire" -ForegroundColor White
Write-Host "3. Installez la nouvelle version" -ForegroundColor White
Write-Host "4. Testez la connexion réseau" -ForegroundColor White
