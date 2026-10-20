@echo off
title Vito Fud - Servidor (no cerrar esta ventana)
cd /d "%~dp0"
set NODE=node
if exist "%~dp0node.exe" set NODE="%~dp0node.exe"
:inicio
%NODE% server.js
echo.
echo El servidor se detuvo. Reiniciando en 3 segundos...
rem las veces siguientes no se vuelve a abrir el navegador
set SIN_NAVEGADOR=1
timeout /t 3 >nul
goto inicio
