@echo off
cd /d "%~dp0"
echo Iniciando CUENTAS en http://localhost:8080
echo Para apagar el servidor, cierra esta ventana o presiona Ctrl+C.
echo.
if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" server.js
) else (
  node server.js
)
