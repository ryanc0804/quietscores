@echo off
title Quiet Scores (localhost)
cd /d "%~dp0quiet-scores-react"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org then run this again. & pause & exit /b 1)
echo Checking dependencies... & call npm install --no-audit --no-fund || (pause & exit /b 1)
start "" http://localhost:5173
call npm run dev
pause
