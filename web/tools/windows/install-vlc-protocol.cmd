@echo off
rem Registers the vlc:// protocol for the current user (no admin rights needed).
setlocal
set "DIR=%LOCALAPPDATA%\TwitchNoSubWeb"
if not exist "%DIR%" mkdir "%DIR%"
copy /y "%~dp0vlc-handler.cmd" "%DIR%\vlc-handler.cmd" >nul

reg add "HKCU\Software\Classes\vlc" /ve /d "URL:VLC Protocol" /f >nul
reg add "HKCU\Software\Classes\vlc" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\vlc\shell\open\command" /ve /d "\"%DIR%\vlc-handler.cmd\" \"%%1\"" /f >nul

echo Les liens vlc:// ouvrent maintenant VLC.
echo Pour annuler : uninstall-vlc-protocol.cmd
pause
