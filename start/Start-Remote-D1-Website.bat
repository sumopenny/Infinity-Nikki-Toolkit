@echo off
setlocal
title NikkiCube - Remote D1 Website

for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI"
cd /d "%PROJECT_DIR%"

set "REMOTE_API_ORIGIN=%~1"
if not defined REMOTE_API_ORIGIN set "REMOTE_API_ORIGIN=https://nikkicube.cc.cd"

echo.
echo ============================================================
echo  NikkiCube - Remote D1 Website
echo ============================================================
echo.
echo This launcher serves the local website and proxies /api to:
echo %REMOTE_API_ORIGIN%
echo.
echo WARNING: Likes, resonance accounts, uploads and cloud deletion
echo affect real cloud data at the target site. Check the address above.
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo Please install Node.js LTS from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found.
    echo Please reinstall Node.js LTS from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo [ERROR] package.json was not found.
    echo Make sure the start folder is inside the project root folder.
    echo.
    pause
    exit /b 1
)

echo Checking project dependencies...
node "%PROJECT_DIR%\start\ensure-dependencies.mjs"
if errorlevel 1 (
    echo.
    echo [ERROR] Dependency check or installation failed. Website startup stopped.
    echo Check the error above, then run this launcher again.
    echo.
    pause
    exit /b 1
)

echo.
echo Starting local website with remote D1 API...
echo Website address: http://localhost:5173
echo Remote API origin: %REMOTE_API_ORIGIN%
echo.

start "Remote D1 Dev Server" cmd /k "cd /d ""%PROJECT_DIR%"" && npm run dev:remote -- --port 5173 --strictPort --open http://localhost:5173"

echo The dev server will open your browser only after startup succeeds.
echo Resource updates may take a while. Check the dev server window for progress.

echo.
echo Once the dev server reports ready, you can also visit:
echo http://localhost:5173
echo.
echo Keep the dev server window open while using the site.
timeout /t 2 /nobreak >nul
endlocal
