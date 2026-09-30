@echo off
reg delete "HKCU\Software\Classes\vlc" /f >nul 2>&1
del "%LOCALAPPDATA%\TwitchNoSubWeb\vlc-handler.cmd" >nul 2>&1
echo Protocole vlc:// supprime.
pause
