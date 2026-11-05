# Cómo trabajar en CiudadAlerta

## Primeros pasos
1. Sigue «Puesta en marcha» del [README](README.md).
2. Publica el backlog como issues (una sola vez, la persona que administre el repo):
   `./scripts/crear-issues.sh` (requiere [GitHub CLI](https://cli.github.com)). Luego crea un tablero en *GitHub Projects*.

## Flujo de ramas
- `main`: siempre estable. `develop`: integración (opcional si el equipo prefiere trabajar directo contra `main`).
- Una rama por historia: `feat/hu-1.5-recuperacion`, `fix/login-mensaje`, `docs/api`.
- **Nadie hace push directo a `main`**: Pull Request con al menos 1 aprobación y CI en verde. Activa la protección de rama en *Settings → Branches*.

## Commits
Mensajes cortos en imperativo, con prefijo: `feat: …`, `fix: …`, `docs: …`, `test: …`, `refactor: …`, `chore: …`.
Ejemplo: `feat(auth): bloquea el login de usuarios bloqueados (HU-1.6)`.

## Antes de abrir un PR
- `npm test` en `backend/` en verde.
- Si tocaste la interfaz, pruébala en el navegador.
- Si cambias la base de datos: **crea una migración nueva** en `backend/migrations/` (`002_…sql`). Nunca edites una ya aplicada.
- Si cambias un endpoint o una regla: actualiza `docs/api.md` o la HU correspondiente.
- Nada de secretos en Git: usa `.env` (ignorado) y `.env.example`.

## Convenciones del código
- Reglas de negocio en `backend/src/services/` (sin SQL ni HTTP). SQL solo en `backend/src/repositories/pg/`. HTTP solo en `backend/src/http/`.
- Cada repositorio PG tiene un gemelo en memoria en `backend/test/helpers/memory-repos.js` con el mismo contrato: si añades un método, añádelo en ambos.
- Un permiso nuevo = un módulo en `backend/src/domain/permissions.js` + su fila en `seed-data.js` + migración/seed si ya hay datos.
- Mensajes al usuario en español; códigos de error estables (`email_taken`) en inglés para que el frontend pueda reaccionar.

## Definición de hecho (por historia)
Criterios verificados · pruebas en verde · probado con PostgreSQL · PR aprobado · docs actualizadas · validado con el Product Owner.
