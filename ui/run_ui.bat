@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%\.."
set "PROJECT_ROOT=%cd%"
set "VENV_DIR=%PROJECT_ROOT%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "REQUIREMENTS_FILE=%PROJECT_ROOT%\requirements.txt"

if "%OPENCLAW_UI_PORT%"=="" (
  set "UI_PORT=18189"
) else (
  set "UI_PORT=%OPENCLAW_UI_PORT%"
)

:: --- Find a suitable Python (3.10+) ---
set "BOOTSTRAP_PYTHON="

if defined PYTHON_BIN (
  where "%PYTHON_BIN%" >nul 2>nul
  if not errorlevel 1 (
    set "BOOTSTRAP_PYTHON=%PYTHON_BIN%"
  ) else (
    echo Python interpreter not found: %PYTHON_BIN%
    pause
    exit /b 1
  )
) else (
  for %%P in (python3 python) do (
    where %%P >nul 2>nul
    if not errorlevel 1 (
      set "BOOTSTRAP_PYTHON=%%P"
      goto :found_python
    )
  )
)
:found_python

if "%BOOTSTRAP_PYTHON%"=="" (
  echo Python 3.10 or newer is required. Install Python or set PYTHON_BIN.
  pause
  exit /b 1
)

:: --- Check Python version ---
"%BOOTSTRAP_PYTHON%" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
  echo Python 3.10 or newer is required. Current interpreter is too old.
  pause
  exit /b 1
)

:: --- Ensure .venv exists ---
if exist "%VENV_PYTHON%" (
  "%VENV_PYTHON%" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
  if errorlevel 1 (
    echo Rebuilding .venv with a supported Python interpreter...
    rmdir /s /q "%VENV_DIR%"
    goto :create_venv
  )
  goto :venv_ready
)

:create_venv
echo Creating project .venv...
"%BOOTSTRAP_PYTHON%" -m venv "%VENV_DIR%"

:venv_ready

:: --- Ensure dependencies ---
"%VENV_PYTHON%" -c "import fastapi, uvicorn, pydantic, requests" >nul 2>nul
if errorlevel 1 (
  echo Installing UI dependencies into .venv...
  "%VENV_PYTHON%" -m pip install -U pip
  "%VENV_PYTHON%" -m pip install -r "%REQUIREMENTS_FILE%"
)

:: --- Free the port ---
echo Ensuring port %UI_PORT% is free...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%UI_PORT%') do taskkill /f /pid %%a >nul 2>&1

:: --- Start ---
echo Starting ComfyUI OpenClaw Skill UI on http://127.0.0.1:%UI_PORT%
cd /d "%PROJECT_ROOT%"
"%VENV_PYTHON%" -m ui.app
if errorlevel 1 (
  echo UI exited with an error.
)
pause
