@echo off
chcp 65001 >nul
title Vito Fud - Instalador (para el técnico)
rem Ejecutar con clic derecho > "Ejecutar como administrador".
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Este instalador necesita permisos de administrador.
  echo Cerralo y volvé a abrirlo con clic derecho ^> Ejecutar como administrador.
  pause
  exit /b 1
)
set DEST=C:\VitoFud
set PUERTO=3000

where node >nul 2>&1
if %errorlevel% neq 0 if not exist "%~dp0node.exe" (
  echo AVISO: no se encontró Node.js en esta PC ni un node.exe junto al instalador.
  echo Instalá Node.js o copiá node.exe a esta carpeta y volvé a correr el instalador.
  pause
  exit /b 1
)

echo Copiando el programa a %DEST% ...
rem Al actualizar NO se pisa la carpeta datos (ventas, PIN, menú) ni las imagenes.
robocopy "%~dp0." "%DEST%" /E /XF instalar.bat /XD datos imagenes >nul
if %errorlevel% geq 8 (echo No se pudo copiar los archivos. & pause & exit /b 1)
if not exist "%DEST%\imagenes" mkdir "%DEST%\imagenes"

echo Permitiendo el programa en el firewall (solo redes privadas) ...
netsh advfirewall firewall delete rule name="Vito Fud" >nul 2>&1
netsh advfirewall firewall add rule name="Vito Fud" dir=in action=allow protocol=TCP localport=%PUERTO% profile=private >nul

echo Evitando que la PC se duerma ...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

echo Creando los accesos directos (escritorio e inicio de Windows) ...
set LNK1=%PUBLIC%\Desktop\Vito Fud.lnk
set LNK2=%ProgramData%\Microsoft\Windows\Start Menu\Programs\StartUp\Vito Fud.lnk
for %%L in ("%LNK1%" "%LNK2%") do powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(%%L); $s.TargetPath='%DEST%\iniciar.bat'; $s.WorkingDirectory='%DEST%'; $s.WindowStyle=7; $s.Save()"

echo.
echo Listo. Falta, en el router: reservar una IP fija para esta PC
echo (si no, los QR impresos dejan de funcionar cuando cambie la dirección).
echo.
echo Abriendo el programa por primera vez ...
start "" "%DEST%\iniciar.bat"
pause
