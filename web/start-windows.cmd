@echo off
title Twitch VOD - m3u8
cd /d "%~dp0"
start "" http://localhost:3000
node src\server.js
pause
