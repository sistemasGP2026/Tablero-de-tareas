# Tablero de Tareas

Aplicación web sencilla con tres roles: un **administrador** crea los usuarios de los jefes de área; cada **jefe de área** asigna tareas a los **trabajadores a su cargo**, y los trabajadores las visualicen y marquen a medida que las completan. Lo que marca el trabajador se refleja en el tablero del jefe (se actualiza solo cada 30 s).

- Backend: Node.js + Express + MongoDB (Mongoose). Sesión con JWT en cookie HttpOnly, contraseñas con bcrypt.
- Frontend: HTML/CSS/JS sin frameworks, servido por el mismo Express.
- Consumo de memoria bajo (~60 MB), pensado para convivir con otros procesos PM2.

## Requisitos
- Node.js 18 o superior
- MongoDB en ejecución (local o remoto)

## Instalación
```bash
npm install
copy .env.example .env        # (Linux/Mac: cp .env.example .env)
```
Edita `.env`: puerto, `MONGO_URI` y un `JWT_SECRET` largo y secreto.

Crea el usuario administrador (usa `SEED_ADMIN_*` del `.env`):
```bash
npm run seed
```
Con datos de ejemplo (jefe `jefe` / `Jefe2026*`, dos trabajadores con contraseña `123456` y cinco tareas):
```bash
npm run seed -- --demo
```

## Ejecutar
```bash
npm start
```
Abre `http://localhost:8090` (o el puerto que pusiste en `.env`).

En producción con PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
```

## Uso
1. **Administrador** inicia sesión (por defecto `admin` / la contraseña del `.env`) y en **Jefes de área** crea el usuario de cada jefe. También ve, solo en lectura, las tareas de toda la empresa.
2. **Jefe de área** inicia sesión y en **Equipo a cargo** crea un usuario y contraseña para cada trabajador.
3. Aparece una lista por trabajador: **Agregar una tarea** (título, detalles, prioridad).
4. El **trabajador** entra con su usuario, ve solo sus tareas, fija su **fecha de entrega** (📅), marca el círculo cuando termina (o ▶ para "en proceso") y puede dejar un comentario.
5. El jefe ve en su tablero el estado, la fecha de finalización, el comentario y el historial (ⓘ) de cada tarea; puede editar, reasignar o eliminar.

Cualquier usuario puede cambiar su propia contraseña desde la cabecera.

## API (resumen)
| Método | Ruta | Quién |
|---|---|---|
| POST | /api/auth/login, /logout, /password · GET /api/auth/me | todos |
| GET, POST | /api/jefes · PATCH /api/jefes/:id | admin |
| GET | /api/trabajadores | jefe (los suyos) / admin (todos) |
| POST | /api/trabajadores · PATCH /api/trabajadores/:id | jefe |
| GET | /api/tareas | admin (todas) / jefe (su equipo) / trabajador (las suyas) |
| POST | /api/tareas · PATCH, DELETE /api/tareas/:id | jefe |
| PATCH | /api/tareas/:id/estado | trabajador dueño o su jefe |
| PATCH | /api/tareas/:id/fecha | trabajador dueño (fecha de entrega) |

## Estructura
```
src/server.js     arranque Express + Mongo
src/models.js     esquemas User y Task
src/auth.js       JWT, cookie y middlewares de rol
src/routes.js     API REST
scripts/seed.js   usuario inicial / datos demo
public/           index.html, styles.css, app.js
```

Cada jefe de área solo ve y administra los trabajadores que él creó. El administrador puede desactivar jefes y restablecer sus contraseñas, pero no modifica tareas.
