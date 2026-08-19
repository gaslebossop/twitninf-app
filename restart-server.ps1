# Script PowerShell pour redémarrer le serveur API

Write-Host "🔄 Redémarrage du serveur API..." -ForegroundColor Cyan

# Aller dans le dossier API
Set-Location -Path "api"

Write-Host "📁 Dossier API: $(Get-Location)" -ForegroundColor Yellow

# Arrêter tous les processus Node.js existants
Write-Host "🛑 Arrêt des processus Node.js existants..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

# Attendre un peu
Start-Sleep -Seconds 2

# Redémarrer le serveur
Write-Host "🚀 Démarrage du serveur..." -ForegroundColor Green
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -NoNewWindow

Write-Host "⏳ Attente du démarrage du serveur..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Tester la connectivité
Write-Host "🧪 Test de connectivité..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 5
    Write-Host "✅ Serveur accessible: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "❌ Serveur non accessible: $($_.Exception.Message)" -ForegroundColor Red
}

# Tester les routes de monétisation
Write-Host "🧪 Test des routes de monétisation..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/tweet-monetization/stats" -TimeoutSec 5
    Write-Host "✅ Routes de monétisation disponibles: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "❌ Routes de monétisation non disponibles: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Le serveur doit être redémarré manuellement" -ForegroundColor Yellow
}

Write-Host "🎉 Script terminé !" -ForegroundColor Green
Write-Host "💡 Vous pouvez maintenant tester l'app mobile" -ForegroundColor Cyan
