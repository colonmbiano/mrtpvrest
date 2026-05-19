@echo off
echo ==========================================
echo MRTPVREST - IA SESSION CLEANUP
echo ==========================================
echo.

echo [1/3] Finalizando procesos de Node (dev servers, turbo)...
taskkill /F /IM node.exe /T >nul 2>&1
echo OK.

echo [2/3] Finalizando procesos de Java/Gradle (Android builds)...
taskkill /F /IM java.exe /T >nul 2>&1
echo OK.

echo [3/3] Limpiando archivos temporales pequeños...
del /s /q *.log >nul 2>&1
del /s /q build_log.txt >nul 2>&1
echo OK.

echo.
echo ==========================================
echo Sistema limpio. Ahora puedes iniciar Claude Code 
echo con un contexto minimo y eficiente.
echo ==========================================
pause
