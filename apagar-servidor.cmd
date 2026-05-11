@echo off
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  echo Apagando servidor CUENTAS en puerto 8080...
  taskkill /PID %%a /F
)
echo Listo.
pause
