@echo off
setlocal
cd /d "%~dp0"
echo Geodaten und Kartonkalender werden aktualisiert. Bitte warten.
node scripts/refresh-geo.js
if errorlevel 1 echo Aktualisierung fehlgeschlagen. Bisherige Daten bleiben erhalten.
pause
