@echo off
rem Start Tavern Screen on Windows. Needs Node.js 20+ (https://nodejs.org).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is needed. Install it from https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm ci --omit=dev
node server.js
