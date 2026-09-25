@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte Node installieren und erneut starten.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Dieser Test sendet sechs feste Demo-Eingaben und Belege an Swisscom.
echo Fuenf Szenarien werden in reports\apertus-live.json protokolliert.
echo Der Schluessel wird verdeckt eingegeben und nicht gespeichert.
powershell -NoProfile -Command "$secureKey = Read-Host 'Swisscom API-Key' -AsSecureString; $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey); $testExit = 1; try { $env:SWISSCOM_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer); & node '.\APERTUS-TEST.mjs' --live; $testExit = $LASTEXITCODE } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer); Remove-Item Env:SWISSCOM_API_KEY -ErrorAction SilentlyContinue }; exit $testExit"
set "test_result=%ERRORLEVEL%"
echo Bericht: %CD%\reports\apertus-live.json
pause
exit /b %test_result%
