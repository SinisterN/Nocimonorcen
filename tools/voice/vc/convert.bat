@echo off
rem Converts every recording in the recordings folder into the hero's voice -> converted\<same name>.flac
cd /d "%~dp0"
set HF_HOME=%~dp0hf
.venv\Scripts\python.exe vc_run.py recordings converted hero_voice.wav
echo.
echo Done. The converted lines are in %~dp0converted
pause
