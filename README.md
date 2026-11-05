# CiudadAlerta

Plataforma comunitaria para **reportar problemas de tu entorno** (un bache, un poste apagado…) y darles seguimiento hasta que se resuelvan.
Proyecto de la materia **ISO615 — Desarrollo de Software con Tecnología Open Source**.

> **Estado:** Épica 1 (Gestión de usuarios y acceso) con código inicial completo. La Épica 2 (reportes, mapa, seguimiento) es la siguiente.

## Qué incluye hoy

| Historia | Qué hace |
|---|---|
| HU-1.1 | Inicio de sesión con cookie segura y redirección según el rol |
| HU-1.2 | Alta de usuarios por un administrador (con invitación por correo) |
| HU-1.3 / 1.4 | Roles y matriz de permisos por módulo (crear · consultar · modificar · eliminar), con efecto inmediato |
| HU-1.5 | Recuperación de contraseña con enlace temporal de un solo uso |
| HU-1.6 | Bloqueo / reactivación de usuarios con motivo |
| HU-1.7 | Perfil: datos, foto y cambio de contraseña |
| HU-1.8 | Auditoría de accesos con IP, localización y filtros |
| (extra) | Registro de ciudadanos — pantalla «Crear cuenta» del prototipo |

Detalle y criterios: [`docs/backlog/epica-1.md`](docs/backlog/epica-1.md).

## Stack (todo open source)

- **Backend:** Node.js 22 (sin framework: `node:http` + router propio), PostgreSQL 16, scrypt, `pg`, `nodemailer`, `geoip-lite`.
- **Frontend:** React 19 + Vite (SPA con rutas por `#`, sin librerías de enrutado ni de estado).
- **Infra:** Docker Compose, Mailpit (correo de desarrollo), GitHub Actions.

Por qué estas decisiones: [`docs/decisiones/`](docs/decisiones/).

## Puesta en marcha

Requisitos: Node 22.9+, Docker.

```bash
cp .env.example .env                      # revisa SEED_ADMIN_* (tu primer Super Administrador)
docker compose up -d db mailpit           # PostgreSQL + bandeja de correos (http://localhost:8025)

cd backend
npm install
npm run db:setup                          # migra, siembra roles y crea el Super Administrador
npm run dev                               # API en http://localhost:3000

# en otra terminal
cd frontend
npm install
npm run dev                               # app en http://localhost:5173
```

Entra con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` del `.env`.
Después de tu primer `npm install`, **haz commit de `package-lock.json`** (backend y frontend): el CI usa `npm ci`.

Todo en contenedores (una sola imagen que sirve API + frontend): `docker compose --profile app up --build` → http://localhost:3000.

## Pruebas

```bash
cd backend
npm test                                  # 55 pruebas, sin base de datos (repositorios en memoria)

# además contra PostgreSQL real (reinicia el esquema de esa base; el nombre debe contener "test"):
createdb ... ciudadalerta_test
TEST_DATABASE_URL=postgres://ciudadalerta:ciudadalerta@localhost:5432/ciudadalerta_test npm test
```

## Estructura

```
backend/            API (src/, migrations/, test/)
frontend/           SPA React (src/pages, src/pages/admin)
docs/               arquitectura, modelo de datos, API, decisiones, backlog, prototipo
scripts/            crear-issues.sh (publica las historias como issues de GitHub)
.github/            CI, plantillas de issues y PR
```

## Documentación

- [Arquitectura](docs/arquitectura.md) · [Modelo de datos](docs/modelo-datos.md) · [API](docs/api.md)
- [Roles y permisos](docs/roles-y-permisos.md)
- [Preguntas abiertas para el Product Owner](docs/preguntas-abiertas.md)
- [Backlog de la Épica 1](docs/backlog/epica-1.md) · [Prototipo navegable](docs/prototipo/prototipo-navegable.html)
- [Cómo contribuir](CONTRIBUTING.md)

## Licencia

MIT — ver [LICENSE](LICENSE).
