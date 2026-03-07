@echo off
setlocal
cd /d "%~dp0"

echo Ensuring port 8189 is free...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8189') do taskkill /f /pid %%a >nul 2>&1

where python >nul 2>nul
if errorlevel 1 (
  echo Python interpreter not found in PATH.
  pause
  exit /b 1
)

echo Starting ComfyUI OpenClaw Skill UI on http://127.0.0.1:8189
python app.py
if errorlevel 1 (
  echo UI exited with an error.
)
pause
