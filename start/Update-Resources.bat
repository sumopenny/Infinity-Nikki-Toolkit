@echo off
setlocal
title NikkiCube - Update Resources
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Install Node.js LTS and try again.
    pause
    exit /b 1
)

node start\ensure-dependencies.mjs
if errorlevel 1 (
    echo [ERROR] Dependency check or installation failed. Resource update stopped.
    pause
    exit /b 1
)

node scripts\update-gongeo-catalog.mjs --strict
if errorlevel 1 (
    echo [ERROR] Resource update failed. Check the error above and try again.
    pause
    exit /b 1
)

echo Resource update completed.
pause
exit /b 0
