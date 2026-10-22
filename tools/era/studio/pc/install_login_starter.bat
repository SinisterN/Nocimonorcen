@echo off
rem Adds the Era Studio login starter to your Windows startup items (current user only, no admin needed).
rem To remove it later: delete "Nocimonorcen Era Studio.lnk" from the folder that opens with Win+R, shell:startup
set SCRIPT=%~dp0studio_login.ps1
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Nocimonorcen Era Studio.lnk'); $s.TargetPath='powershell.exe'; $s.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%SCRIPT%\"'; $s.WindowStyle=7; $s.Save()"
if errorlevel 1 (echo Could not add the startup item.) else (echo Added. The studio will start two minutes after you log in. Log: %~dp0studio_login.log)
pause
