# Roles y permisos iniciales

Definidos en [`backend/src/domain/seed-data.js`](../backend/src/domain/seed-data.js). El seed es idempotente: no pisa lo que un administrador haya editado.

**Módulos:** `usuarios`, `roles`, `permisos`, `auditoria`, `reportes` (reservado para la Épica 2).
**Acciones:** C = crear · R = consultar · U = modificar · D = eliminar.

| Rol (código) | Dashboard | usuarios | roles | permisos | auditoría | reportes |
|---|---|:-:|:-:|:-:|:-:|:-:|
| Super Administrador (`super_admin`) | /admin | CRUD | CRUD | CRUD | CRUD | CRUD |
| Administrador (`admin`) | /admin | CRUD | R | — | R | CRUD |
| Supervisor (`supervisor`) | /admin | R | — | — | R | RU |
| Ciudadano (`ciudadano`) | /inicio | — | — | — | — | CR |

- El Super Administrador es inmutable y siempre tiene todo.
- Los roles del sistema no se eliminan ni se renombran; los roles propios se crean desde el panel.
- Los permisos (y el rol) cambian en caliente: se consultan en cada request.

> Los roles *Agente Inmobiliario, Arquitecto, Ingeniero y Cliente* del backlog original no se sembraron; ver [preguntas abiertas](preguntas-abiertas.md). Si el PO confirma que aplican, se crean desde el panel o agregándolos a `SYSTEM_ROLES`.
