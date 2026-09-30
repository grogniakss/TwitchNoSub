@echo off
rem Opens a vlc://<url> link in VLC. Registered by install-vlc-protocol.cmd.
setlocal
set "u=%~1"
set "u=%u:vlc://=%"
rem Some browsers turn "vlc://https://x" into "vlc://https//x".
set "u=%u:https//=https://%"
set "u=%u:http//=http://%"
set "v=%ProgramFiles%\VideoLAN\VLC\vlc.exe"
if not exist "%v%" set "v=%ProgramFiles(x86)%\VideoLAN\VLC\vlc.exe"
start "" "%v%" "%u%"
