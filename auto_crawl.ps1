# 1. מחיקת כל הקבצים והתיקיות הישנים (בלי לשאול שאלות)
Write-Host "Cleaning old files and folders..." -ForegroundColor Cyan
Remove-Item -Path "A:\vs code\fullstack\SmartCart\my_prices\*" -Force -Recurse -ErrorAction SilentlyContinue

# 2. הרצת הדוקר להורדת קבצים חדשים
Write-Host "Starting crawler..." -ForegroundColor Green
docker run --rm -v "A:\vs code\fullstack\SmartCart\my_prices:/usr/src/app/dumps" erlichsefi/israeli-supermarket-scarpers:latest

Write-Host "Done! New prices are ready." -ForegroundColor Green
