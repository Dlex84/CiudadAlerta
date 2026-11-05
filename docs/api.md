# API

Base: `/api`. JSON en cuerpo y respuesta. Sesión por cookie `ca_session` (el navegador la envía solo).
Errores: `{ "error": { "code": "email_taken", "message": "…", "details"?: {…} } }`.
Códigos comunes: `400` validación · `401` sin sesión/credenciales · `403` sin permiso · `404` · `409` conflicto de reglas · `415`/`413` tipo/tamaño · `429` demasiados intentos.

## Autenticación (públicos, con límite de intentos)
| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /auth/login` | `{email, password}` | `200 {user, role, permissions, redirectTo}` + cookie |
| `POST /auth/register` | `{fullName, email, password, sector?, phone?, acceptTerms:true}` | `201` igual que login (rol Ciudadano) |
| `POST /auth/forgot-password` | `{email}` | `200` siempre igual |
| `POST /auth/reset-password` | `{token, password}` | `200`; `400 invalid_or_expired_token` |
| `POST /auth/logout` 🔒 | — | `204` y borra la cookie |

## Perfil propio 🔒
| Ruta | Detalle |
|---|---|
| `GET /me` | Usuario, rol, mapa de permisos, `redirectTo` |
| `PATCH /me` | `{fullName?, phone?, sector?}` |
| `PUT /me/password` | `{currentPassword, newPassword}` → `204`; cierra otras sesiones |
| `PUT /me/photo` | Cuerpo = imagen cruda, `Content-Type: image/jpeg\|png\|webp`, ≤ 2 MB |
| `GET /meta/permissions` | Módulos, acciones y dashboards válidos |

## Usuarios 🔒 (permiso `usuarios`)
| Ruta | Permiso | Notas |
|---|---|---|
| `GET /users?q&status&roleId&page&limit` | read | `status`: `active\|blocked` |
| `GET /users/:id` | read | |
| `POST /users` | create | `{fullName, email, phone?, sector?, roleId}` → `201 {user, invitationSent}` |
| `PATCH /users/:id` | update | `{fullName?, phone?, sector?, roleId?}` |
| `DELETE /users/:id` | delete | Baja lógica → `204` |
| `POST /users/:id/block` | update | `{reason}` obligatorio; cierra sesiones |
| `POST /users/:id/unblock` | update | |
| `POST /users/:id/resend-invitation` | update | Solo si no activó la cuenta |

## Roles y permisos 🔒
| Ruta | Permiso |
|---|---|
| `GET /roles` · `GET /roles/:id` | roles.read |
| `POST /roles` `{name, description?, dashboardPath?}` | roles.create |
| `PATCH /roles/:id` `{name?, description?, dashboardPath?, isActive?}` | roles.update |
| `DELETE /roles/:id` | roles.delete (`409 role_in_use` / `role_is_system`) |
| `GET /roles/:id/permissions` | permisos.read |
| `PUT /roles/:id/permissions` `{permissions:[{module, create?, read?, update?, delete?}]}` | permisos.update |

## Auditoría 🔒
`GET /audit/access?email&event&ip&userId&from&to&page&limit` (permiso `auditoria.read`).
`from`/`to` aceptan `YYYY-MM-DD` (UTC, `to` inclusivo) o ISO completo. Eventos: `login_success`, `login_failed`, `login_blocked`, `logout`.

## Otros
`GET /health` · `GET /uploads/avatars/:file` (fotos de perfil).

---

# Épica 2 — Gestión de operaciones 🔒

`:id` de un reporte acepta el UUID o el código (`CA-0001`). Fechas `from`/`to` igual que en auditoría.
Filtros comunes de reportes (lista, panel y reportes operativos): `status` (uno o varios separados por coma) · `bucket` (`pendientes|en_proceso|completados|rechazados|abiertos`) · `typeCode` · `assigneeId` (`<uuid>|me|none`) · `from` · `to` · `q` · `overdue=1` · `mine=1`.

## Reportes y seguimiento (HU-2.2)
| Ruta | Permiso | Notas |
|---|---|---|
| `GET /meta/operations` | sesión | Estados, transiciones, grupos, tipos activos, catálogos de incidencias |
| `POST /reports` | reportes.create | `{typeCode, title, description, location}` → `201` con `code`, `status: reportado`, `dueAt` |
| `GET /reports?…&page&limit` | reportes.read u operaciones.read | Sin `operaciones.read` solo devuelve los propios |
| `GET /reports/:id` | reportes.read u operaciones.read | `{report, history[], allowedTransitions[]}`; ajeno → `404` |
| `POST /reports/:id/transitions` | operaciones.update | `{to, reason?}`. Errores: `invalid_transition` (con `details.allowed`), `assignee_required`, `invalid_reason`, `approval_required`, `approval_pending`, `approval_rejected`, `not_assignee`, `status_changed` |

## Asignación y notificaciones (HU-2.3)
| Ruta | Permiso | Notas |
|---|---|---|
| `GET /assignees` | asignaciones.read | Usuarios activos con `operaciones.update` y cuántos abiertos tienen |
| `PUT /reports/:id/assignee` | asignaciones.update | `{assigneeId, reason}` (motivo obligatorio al reasignar). `invalid_assignee`, `already_assigned`, `report_closed` |
| `GET /reports/:id/assignments` | operaciones.read | Quién asignó, a quién, cuándo y por qué |
| `GET /notifications?unread=1&page&limit` | sesión | `{items, total, unread}` |
| `POST /notifications/:id/read` · `POST /notifications/read-all` | sesión | `204` |

## Plazos y alertas (HU-2.5)
| Ruta | Permiso | Notas |
|---|---|---|
| `GET /config/report-types` | configuracion.read | Plazo (`slaHours`) y aviso previo (`warnBeforeHours`) por tipo |
| `PATCH /config/report-types/:code` | configuracion.update | `{slaHours?, warnBeforeHours?, isActive?}` (enteros; aviso < plazo) |
| `GET /alerts/upcoming` | operaciones.read | Vencidos y por vencer (el operador ve solo los suyos) |
| `POST /alerts/run` | configuracion.update | Ejecuta la revisión ya: `{checked, overdue, dueSoon, sent, failed, skipped}` |
| `GET /alerts/deliveries?report&kind&status&from&to` | configuracion.read | Registro de envíos por canal (`in_app`, `email`) y resultado |

## Aprobaciones (HU-2.4)
| Ruta | Permiso | Notas |
|---|---|---|
| `GET /config/report-types/:code/approval-steps` | configuracion.read | |
| `PUT /config/report-types/:code/approval-steps` | configuracion.update | `{steps:[{name, approverRoleCode?, required?}]}` (máx. 5; `[]` = sin aprobación) |
| `GET /reports/:id/approvals` | operaciones.read | `{configuredSteps, rounds[], currentStatus, canRequest}` |
| `POST /reports/:id/approvals` | operaciones.update | Abre una ronda (reporte «En proceso»). `approval_already_pending`, `already_approved`, `no_approval_steps` |
| `POST /reports/:id/approvals/:approvalId/decision` | aprobaciones.update | `{decision: approved\|rejected\|returned, comment}` (comentario obligatorio salvo al aprobar). `previous_step_pending`, `not_approver`, `self_approval`, `approval_not_pending` |
| `GET /approvals/pending` | aprobaciones.read | Pasos que le toca decidir a este usuario |

## Incidencias (HU-2.6)
| Ruta | Permiso | Notas |
|---|---|---|
| `POST /reports/:id/incidents` | incidencias.create | `{category, description, priority, assigneeId?}` |
| `GET /incidents?report&status&priority&category&assigneeId` | incidencias.read | |
| `GET /incidents/:id` | incidencias.read | `{incident, events[]}` |
| `PATCH /incidents/:id` | incidencias.update | `{status?, resolution?, priority?, assigneeId?}`; «resuelta» exige `resolution` |
| `POST /incidents/:id/comments` | incidencias.update | `{comment}` |

## Panel y reportes operativos (HU-2.1, HU-2.7)
| Ruta | Permiso | Notas |
|---|---|---|
| `GET /dashboard` | indicadores.read | `{indicators:{creados, pendientes, en_proceso, completados, rechazados, vencidos}, byStatus, lastUpdatedAt, generatedAt, filters}` |
| `GET /indicators/report` | indicadores.read | `{metrics:[{key,label,unit,definition,value}], byType, byAssignee, byStatus, generatedAt, filters}` |
| `GET /indicators/report.csv` | indicadores.create | `text/csv` con fecha de generación, filtros, métricas con definición y filas |

## Bitácora (HU-2.8)
`GET /changelog?report&actorId&entity&action&result&from&to&page&limit` (permiso `bitacora.read`). No existen rutas para modificarla.
Entidades: `report`, `approval`, `approval_steps`, `incident`, `report_type`, `export`. Resultado: `success` | `rejected`.
