@echo off
cd /d "%~dp0"
echo === Instalando dependencias ===
call npm install
echo === Creando usuario administrador ===
call npm run seed
echo === Iniciando Tablero de Tareas en http://localhost:8090 ===
call npm start
pause
