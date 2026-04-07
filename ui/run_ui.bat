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

set "BOOTSTRAP_PYTHON="
set "BOOTSTRAP_PYTHON_ARGS="

if defined PYTHON_BIN (
  call :try_python_candidate "%PYTHON_BIN%"
  if errorlevel 1 (
    echo PYTHON_BIN must point to Python 3.10 or newer with the standard venv module: %PYTHON_BIN%
    pause
    exit /b 1
  )
) else (
  if defined VIRTUAL_ENV (
    if exist "%VIRTUAL_ENV%\Scripts\python.exe" (
      call :try_python_candidate "%VIRTUAL_ENV%\Scripts\python.exe"
      if not errorlevel 1 goto :found_python
    )
  )

  for %%V in (3.14 3.13 3.12 3.11 3.10) do (
    call :try_py_launcher %%V
    if not errorlevel 1 goto :found_python
  )

  for %%P in (python3.14 python3.13 python3.12 python3.11 python3.10 python3 python) do (
    call :try_python_candidate "%%P"
    if not errorlevel 1 goto :found_python
  )
)
:found_python

if "%BOOTSTRAP_PYTHON%"=="" (
  echo Python 3.10 or newer is required. Install Python 3.10+ or set PYTHON_BIN.
  pause
  exit /b 1
)

for /f %%V in ('call :run_bootstrap -c "import sys; print(str(sys.version_info[0]) + chr(46) + str(sys.version_info[1]))"') do set "BOOTSTRAP_PYTHON_VERSION=%%V"
echo Using Python interpreter: %BOOTSTRAP_PYTHON% %BOOTSTRAP_PYTHON_ARGS% (Python %BOOTSTRAP_PYTHON_VERSION%)

:: --- Ensure .venv exists ---
if exist "%VENV_PYTHON%" (
  "%VENV_PYTHON%" -c "import sys, venv; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
  if errorlevel 1 (
    echo Rebuilding .venv with a supported Python interpreter...
    rmdir /s /q "%VENV_DIR%"
    goto :create_venv
  )
  goto :venv_ready
)

:create_venv
echo Creating project .venv...
call :run_bootstrap -m venv "%VENV_DIR%"
if errorlevel 1 (
  echo Failed to create .venv with %BOOTSTRAP_PYTHON% %BOOTSTRAP_PYTHON_ARGS%.
  pause
  exit /b 1
)

:venv_ready

:: --- Ensure dependencies ---
"%VENV_PYTHON%" -c "import fastapi, uvicorn, pydantic, requests, multipart" >nul 2>nul
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
exit /b 0

:try_python_candidate
if exist "%~1" goto :try_python_candidate_found
where "%~1" >nul 2>nul
if errorlevel 1 exit /b 1

:try_python_candidate_found
"%~1" -c "import sys, venv; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if errorlevel 1 exit /b 1
set "BOOTSTRAP_PYTHON=%~1"
set "BOOTSTRAP_PYTHON_ARGS="
exit /b 0

:try_py_launcher
where py >nul 2>nul
if errorlevel 1 exit /b 1
py -%~1 -c "import sys, venv; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if errorlevel 1 exit /b 1
set "BOOTSTRAP_PYTHON=py"
set "BOOTSTRAP_PYTHON_ARGS=-%~1"
exit /b 0

:run_bootstrap
if defined BOOTSTRAP_PYTHON_ARGS (
  "%BOOTSTRAP_PYTHON%" %BOOTSTRAP_PYTHON_ARGS% %*
) else (
  "%BOOTSTRAP_PYTHON%" %*
)
exit /b %errorlevel%
