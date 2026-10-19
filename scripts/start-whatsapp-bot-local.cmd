@echo off
setlocal EnableExtensions

set "ROOT_DIR=C:\Users\colon\Downloads\mrtpvrest"
set "WORKTREE_BACKEND=%ROOT_DIR%\.claude\worktrees\wa-bot-host\apps\backend"
set "LOG_DIR=%ROOT_DIR%\logs"
set "OLLAMA_EXE=C:\Users\colon\AppData\Local\Programs\Ollama\ollama.exe"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: 1. Evitar instancias duplicadas si el puerto 3005 ya está escuchando
netstat -ano | findstr /R /C:":3005 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [%DATE% %TIME%] Worker de WhatsApp ya activo en :3005. Saliendo. >> "%LOG_DIR%\whatsapp-bot.log"
  exit /b 0
)

:: 2. Auto-reparar enlaces de whatsapp-web.js y qrcode-terminal si faltan
if not exist "%ROOT_DIR%\node_modules\whatsapp-web.js" (
  mklink /J "%ROOT_DIR%\node_modules\whatsapp-web.js" "%ROOT_DIR%\.claude\worktrees\wa-bot-host\node_modules\.pnpm\whatsapp-web.js@1.34.7_typescript@5.9.3\node_modules\whatsapp-web.js" >nul 2>&1
)
if not exist "%ROOT_DIR%\node_modules\qrcode-terminal" (
  mklink /J "%ROOT_DIR%\node_modules\qrcode-terminal" "%ROOT_DIR%\.claude\worktrees\wa-bot-host\node_modules\.pnpm\qrcode-terminal@0.12.0\node_modules\qrcode-terminal" >nul 2>&1
)

set "QUIET_QR_LOG=1"
set "WWEBJS_DATA_PATH=%ROOT_DIR%\apps\backend\.wwebjs_auth"
set "OLLAMA_BASE_URL=http://127.0.0.1:11434"
set "OLLAMA_MODEL=qwen3.5:4b"
set "NODE_PATH=%ROOT_DIR%\node_modules;%ROOT_DIR%\.claude\worktrees\wa-bot-host\node_modules\.pnpm\node_modules"

cd /d "%WORKTREE_BACKEND%"

:loop
:: 3. Asegurar que Ollama local esté corriendo en :11434
netstat -ano | findstr /R /C:":11434 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  if exist "%OLLAMA_EXE%" (
    echo [%DATE% %TIME%] Iniciando servidor local Ollama (qwen3.5:4b)... >> "%LOG_DIR%\whatsapp-bot.log"
    start "" /b "%OLLAMA_EXE%" serve >> "%LOG_DIR%\ollama.log" 2>&1
    timeout /t 3 /nobreak >nul
  )
)

echo [%DATE% %TIME%] Iniciando WhatsApp Bot Worker (modo local)... >> "%LOG_DIR%\whatsapp-bot.log"
"%NODE_EXE%" --env-file="%ROOT_DIR%\apps\backend\.env" "%WORKTREE_BACKEND%\src\whatsapp\worker.js" >> "%LOG_DIR%\whatsapp-bot.log" 2>&1

echo [%DATE% %TIME%] Worker finalizó (código %ERRORLEVEL%). Reiniciando en 5 segundos... >> "%LOG_DIR%\whatsapp-bot.log"
timeout /t 5 /nobreak >nul
goto loop
