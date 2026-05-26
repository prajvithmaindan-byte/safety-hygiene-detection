@echo off
:: Setup window size and title
title HygieneGuard Control Center
mode con: cols=70 lines=22
color 0A

echo ======================================================================
echo  HYGIENEGUARD - FOOD SAFETY HYGIENE MONITORING SYSTEM
echo ======================================================================
echo.
echo  [1/3] Setting working directory...
cd /d "%~dp0"
echo      Current Path: %CD%
echo.

echo  [2/3] Launching Flask Backend Server in a new window...
echo      (You can view real-time logs and AI detection output there)
:: Launch backend in a separate terminal, activating venv first
start "HygieneGuard Backend Service" cmd /k "call venv\Scripts\activate.bat && echo Starting Flask App... && python backend/app.py"
echo.

echo  [3/3] Waiting for server to initialize (3 seconds)...
timeout /t 3 /nobreak >nul
echo.

echo  [+] Launching Web UI at http://localhost:5000 ...
start http://localhost:5000
echo.

echo ======================================================================
echo  SUCCESS: HygieneGuard is active!
echo  
echo  * Keep the "HygieneGuard Backend Service" window open while using.
echo  * To stop the app, simply close the backend service window.
echo ======================================================================
echo.
echo  This launcher will close in 5 seconds...
timeout /t 5 >nul
exit
