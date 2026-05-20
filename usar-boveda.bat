@echo off
echo.
echo 🔐 MI BÓVEDA PERSONAL - Menú Rápido
echo ===================================
echo.
echo 1. Verificar API
echo 2. Guardar dato cifrado
echo 3. Leer dato (desencriptado)
echo 4. Listar todos mis datos
echo 5. Salir
echo.
set /p opcion="Elige una opción (1-5): "

if "%opcion%"=="1" goto health
if "%opcion%"=="2" goto guardar
if "%opcion%"=="3" goto leer
if "%opcion%"=="4" goto listar
if "%opcion%"=="5" exit

:health
powershell -Command "Invoke-RestMethod -Uri 'http://localhost:3000/health'"
pause
goto menu

:guardar
set /p titulo="Título: "
set /p contenido="Contenido secreto: "
powershell -Command "Invoke-RestMethod -Uri 'http://localhost:3000/vault' -Method Post -Headers @{'x-api-key'='test123'} -Body '{\"titulo\":\"%titulo%\",\"contenido\":\"%contenido%\",\"tipo\":\"nota\"}' -ContentType 'application/json'"
pause
goto menu

:leer
set /p id="ID del dato a leer: "
powershell -Command "Invoke-RestMethod -Uri 'http://localhost:3000/vault/%id%' -Headers @{'x-api-key'='test123'}"
pause
goto menu

:listar
powershell -Command "Invoke-RestMethod -Uri 'http://localhost:3000/vault' -Headers @{'x-api-key'='test123'}"
pause
goto menu

:menu
cls
goto menu