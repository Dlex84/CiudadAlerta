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
