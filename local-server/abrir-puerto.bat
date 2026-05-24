@echo off
:: abrir-puerto.bat
:: Abre el puerto 3001 en Windows Defender Firewall para que las tablets
:: puedan conectarse al relay LAN de mimenú.
:: Ejecutar UNA SOLA VEZ como Administrador.

echo.
echo  mimenú — Configuración de firewall
echo  ====================================
echo.

:: Verificar que se está ejecutando como administrador
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Este script debe ejecutarse como Administrador.
    echo.
    echo  Instruccion: clic derecho en este archivo → "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

echo  Abriendo puerto 3001 (TCP entrante) en Windows Defender...
echo.

:: Eliminar regla anterior si existe (evita duplicados)
netsh advfirewall firewall delete rule name="mimenu-relay-3001" >nul 2>&1

:: Crear regla para tráfico entrante en puerto 3001
netsh advfirewall firewall add rule ^
    name="mimenu-relay-3001" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3001 ^
    profile=private,domain ^
    description="mimenú LAN relay — permite que tablets y monitor de cocina se conecten"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  Puerto 3001 abierto correctamente.
    echo.
    echo  Las tablets en la misma red WiFi ahora pueden conectarse al relay.
    echo  Para verificar: abrí http://[IP-DE-ESTA-PC]:3001/health en el navegador de una tablet.
    echo.
) else (
    echo.
    echo  ERROR: No se pudo abrir el puerto. Verificá que Windows Defender esté activo.
    echo.
)

pause
