@echo off
setlocal
cd /d "%~dp0"

if "%OPENCLAW_UI_PORT%"=="" (
  set "UI_PORT=18189"
) else (
  set "UI_PORT=%OPENCLAW_UI_PORT%"
)

echo Ensuring port %UI_PORT% is free...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%UI_PORT%') do taskkill /f /pid %%a >nul 2>&1

where python >nul 2>nul
if errorlevel 1 (
  echo Python interpreter not found in PATH.
  pause
  exit /b 1
)

echo Starting ComfyUI OpenClaw Skill UI on http://127.0.0.1:%UI_PORT%
python app.py
if errorlevel 1 (
  echo UI exited with an error.
)
pause
