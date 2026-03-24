@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=powershell.exe"
set "POWERSHELL_SCRIPT=%SCRIPT_DIR%start-weapp-preview.ps1"

if not exist "%POWERSHELL_SCRIPT%" (
    echo ERROR: PowerShell script not found: %POWERSHELL_SCRIPT%
    exit /b 1
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%POWERSHELL_SCRIPT%"
exit /b %ERRORLEVEL%
