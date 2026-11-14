@echo off
setlocal EnableExtensions
title NEXORA Launcher
cd /d "%~dp0"
color 0B
echo.
echo  NEXORA - SMART MARKET WORKSPACE
echo  --------------------------------
echo.

where git >nul 2>nul
if not errorlevel 1 (
  git rev-parse --is-inside-work-tree >nul 2>nul
  if not errorlevel 1 (
    for /f %%i in ('git status --porcelain') do set DIRTY=1
    if not defined DIRTY (
      echo [UPDATE] Checking GitHub for updates...
      git fetch origin main
      if not errorlevel 1 git pull --ff-only origin main
      if errorlevel 1 echo [WARN] Update skipped. Existing local files were preserved.
    ) else (
      echo [WARN] Local changes detected. Automatic update skipped to protect your work.
    )
  )
)

set "PYTHON="
where py >nul 2>nul
if not errorlevel 1 (
  py -3.12 --version >nul 2>nul && set "PYTHON=py -3.12"
  if not defined PYTHON py -3 --version >nul 2>nul && set "PYTHON=py -3"
)
if not defined PYTHON (
  where python >nul 2>nul
  if not errorlevel 1 python --version >nul 2>nul && set "PYTHON=python"
)
if not defined PYTHON (
  echo [ERROR] Python 3.10 or newer was not found.
  echo Install Python from https://www.python.org/downloads/ and enable Add Python to PATH.
  pause
  exit /b 1
)
if not exist "backend\requirements.txt" (
  echo [ERROR] backend\requirements.txt is missing. Please reinstall NEXORA.
  pause
  exit /b 1
)
if not exist "backend\.venv\Scripts\python.exe" (
  echo [SETUP] Creating isolated Python environment...
  %PYTHON% -m venv "backend\.venv"
  if errorlevel 1 goto repair_venv
)
set "VPY=%~dp0backend\.venv\Scripts\python.exe"
echo [SETUP] Checking pip...
"%VPY%" -m ensurepip --upgrade
if errorlevel 1 goto repair_venv
"%VPY%" -m pip install --disable-pip-version-check --upgrade pip
if errorlevel 1 goto install_retry
echo [SETUP] Installing / repairing requirements...
"%VPY%" -m pip install --disable-pip-version-check --retries 5 --timeout 30 -r "backend\requirements.txt"
if errorlevel 1 goto install_retry
"%VPY%" -m pip check
if errorlevel 1 goto install_retry

echo.
echo [START] Launching NEXORA...
cd /d "%~dp0backend"
start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 1;if($r.StatusCode -eq 200){Start-Process http://127.0.0.1:8000;break}}catch{Start-Sleep -Seconds 1}}"
"%VPY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
if errorlevel 1 (
  echo.
  echo [ERROR] NEXORA stopped unexpectedly.
  pause
)
exit /b 0

:install_retry
echo [REPAIR] Dependency installation failed. Clearing pip cache and retrying...
"%VPY%" -m pip cache purge
"%VPY%" -m pip install --disable-pip-version-check --no-cache-dir --retries 8 --timeout 60 -r "%~dp0backend\requirements.txt"
if not errorlevel 1 goto launch_retry
echo [ERROR] Automatic dependency repair could not complete.
echo Check your internet connection, antivirus, disk space and Python installation.
pause
exit /b 1

:launch_retry
cd /d "%~dp0backend"
echo [START] Launching after dependency repair...
start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 1;if($r.StatusCode -eq 200){Start-Process http://127.0.0.1:8000;break}}catch{Start-Sleep -Seconds 1}}"
"%VPY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
exit /b 0

:repair_venv
echo [REPAIR] Rebuilding the isolated Python environment...
if exist "backend\.venv" rmdir /s /q "backend\.venv"
%PYTHON% -m venv "backend\.venv"
if errorlevel 1 (
  echo [ERROR] Could not create the Python environment.
  pause
  exit /b 1
)
set "VPY=%~dp0backend\.venv\Scripts\python.exe"
goto install_retry
