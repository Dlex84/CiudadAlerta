# Roles y permisos iniciales

Definidos en [`backend/src/domain/seed-data.js`](../backend/src/domain/seed-data.js). El seed es idempotente: no pisa lo que un administrador haya editado.

**Módulos:** `usuarios`, `roles`, `permisos`, `auditoria` (Épica 1) y, de la Épica 2: `reportes`, `operaciones`, `asignaciones`, `aprobaciones`, `incidencias`, `configuracion`, `indicadores`, `bitacora`.
**Acciones:** C = crear · R = consultar · U = modificar · D = eliminar.

### Épica 1
| Rol (código) | Dashboard | usuarios | roles | permisos | auditoría |
|---|---|:-:|:-:|:-:|:-:|
| Super Administrador (`super_admin`) | /admin | CRUD | CRUD | CRUD | CRUD |
| Administrador (`admin`) | /admin | CRUD | R | — | R |
| Supervisor (`supervisor`) | /admin | R | — | — | R |
| Operador / Técnico (`operador`) | /admin | — | — | — | — |
| Gerente (`gerente`) | /admin | — | — | — | — |
| Auditor (`auditor`) | /admin | — | — | — | R |
| Ciudadano (`ciudadano`) | /inicio | — | — | — | — |

### Épica 2
| Rol | reportes | operaciones | asignaciones | aprobaciones | incidencias | configuración | indicadores | bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Super Administrador | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |
| Administrador | CRUD | RU | RU | R | CRUD | RU | CR | R |
| Supervisor | RU | RU | RU | RU | CRU | R | CR | R |
| Operador / Técnico | — | RU | R | R | CRU | — | R | — |
| Gerente | — | R | R | R | R | R | CR | R |
| Auditor | — | R | R | R | R | R | R | R |
| Ciudadano | CR | — | — | — | — | — | — | — |

**Qué significa cada acción en la Épica 2**

| Módulo | C | R | U |
|---|---|---|---|
| `reportes` | crear un reporte | ver **los propios** | — |
| `operaciones` | — | ver **todos** los reportes | cambiar estado, pedir aprobación (el operador solo en los asignados a él) |
| `asignaciones` | — | ver responsables posibles | asignar / reasignar |
| `aprobaciones` | — | bandeja | aprobar, rechazar, devolver |
| `incidencias` | registrar | consultar | cambiar estado, prioridad, responsable, comentar |
| `configuracion` | — | ver plazos, pasos y envíos | editar plazos y pasos, lanzar la revisión de alertas |
| `indicadores` | **exportar CSV** | panel y reportes operativos | — |
| `bitacora` | — | consultar | — (no existe) |

Al actualizar una base de la Épica 1, `npm run db:seed` agrega los módulos nuevos a los roles del sistema **sin pisar** lo que un administrador ya editó, y crea los roles Operador, Gerente y Auditor.

- El Super Administrador es inmutable y siempre tiene todo.
- Los roles del sistema no se eliminan ni se renombran; los roles propios se crean desde el panel.
- Los permisos (y el rol) cambian en caliente: se consultan en cada request.

> Operador, Gerente y Auditor vienen del plan de la Épica 2. Los roles *Agente Inmobiliario, Arquitecto, Ingeniero y Cliente* del backlog original no se sembraron; ver [preguntas abiertas](preguntas-abiertas.md). Si el PO confirma que aplican, se crean desde el panel o agregándolos a `SYSTEM_ROLES`.
