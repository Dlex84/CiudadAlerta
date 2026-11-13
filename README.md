# CiudadAlerta

Plataforma comunitaria para **reportar problemas de tu entorno** (un bache, un poste apagado…) y darles seguimiento hasta que se resuelvan.
Proyecto de la materia **ISO615 — Desarrollo de Software con Tecnología Open Source**.

> **Estado:** Épica 1 (usuarios y acceso), Épica 2 (gestión de operaciones) y Épica 3 (recursos e inventario) con código completo. Mapa y fotografías quedan para una próxima épica.

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
| HU-2.1 | Panel de operaciones: creados, en proceso, completados, rechazados y vencidos, con filtros |
| HU-2.2 | Registro y seguimiento de reportes (#CA-0001) con transiciones de estado validadas e historial |
| HU-2.3 | Asignación y reasignación de responsables con motivo y notificaciones |
| HU-2.4 | Flujos de aprobación configurables por tipo antes de «Resuelto», con devolución para corrección |
| HU-2.5 | Plazos por tipo, alertas de vencidos y por vencer sin repetir, y registro de envíos |
| HU-2.6 | Incidencias operativas vinculadas a un reporte, con estados, resolución e historial |
| HU-2.7 | Reportes operativos con métricas definidas y exportación CSV |
| HU-2.8 | Bitácora de cambios inmutable con valores antes/después |
| HU-3.1 | Catálogo de recursos (materiales y equipos) con código REC-0001, mínimo y ubicación |
| HU-3.2 | Entradas de inventario (compras, donaciones) con origen y saldo resultante |
| HU-3.3 | Salidas de material ligadas a un reporte; asignación y devolución de equipos |
| HU-3.4 | Validación de disponibilidad: la existencia nunca queda negativa; aviso de bajo mínimo |
| HU-3.5 | Historial de movimientos de solo inserción, con filtros |
| HU-3.6 | Reporte de existencias y movimientos con exportación CSV |

Detalle y criterios: [`docs/backlog/epica-1.md`](docs/backlog/epica-1.md) · [`docs/backlog/epica-2.md`](docs/backlog/epica-2.md) · [`docs/backlog/epica-3.md`](docs/backlog/epica-3.md).

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
npm run db:demo                           # (opcional) usuarios de cada rol y reportes de ejemplo
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
npm test                                  # 113 pruebas, sin base de datos (repositorios en memoria)

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
- [Backlog de la Épica 1](docs/backlog/epica-1.md) · [Backlog de la Épica 2](docs/backlog/epica-2.md) · [Prototipo navegable](docs/prototipo/prototipo-navegable.html)
- [Cómo contribuir](CONTRIBUTING.md)

## Licencia

MIT — ver [LICENSE](LICENSE).
