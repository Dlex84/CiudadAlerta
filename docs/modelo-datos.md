# Modelo de datos (Épica 1)

Migración: [`backend/migrations/001_usuarios_roles_y_acceso.sql`](../backend/migrations/001_usuarios_roles_y_acceso.sql).

```mermaid
erDiagram
  roles ||--o{ users : "tiene"
  roles ||--o{ role_permissions : "define"
  users ||--o{ sessions : "abre"
  users ||--o{ password_reset_tokens : "solicita"
  users ||--o{ access_logs : "genera"
  roles { int id PK
    text code UK "solo roles del sistema"
    text name UK "sin distinguir mayúsculas"
    text dashboard_path "/inicio o /admin"
    bool is_active
    bool is_system }
  role_permissions { int role_id PK
    text module PK
    bool can_create
    bool can_read
    bool can_update
    bool can_delete }
  users { uuid id PK
    text email UK "único entre no eliminados"
    text password_hash "NULL = invitado"
    int role_id FK
    text status "active | blocked"
    text blocked_reason
    timestamptz last_login_at
    timestamptz profile_updated_at
    timestamptz deleted_at "baja lógica" }
  sessions { uuid id PK
    text token_hash UK
    timestamptz expires_at
    timestamptz revoked_at }
  password_reset_tokens { uuid id PK
    text token_hash UK
    text purpose "reset | invite"
    timestamptz expires_at
    timestamptz used_at }
  access_logs { bigint id PK
    uuid user_id FK "NULL si el correo no existe"
    text email_attempted
    text event "login_success | login_failed | login_blocked | logout"
    text ip
    text country
    text city }
```

## Decisiones
- **Permisos como matriz** (`role_permissions`) en vez de un catálogo de permisos: es exactamente lo que pide HU-1.4 (módulo × 4 acciones) y la pantalla es una tabla de casillas. Si luego se necesitan permisos más finos (p. ej. «cerrar reporte»), se agrega un módulo o una tabla `permissions`.
- **Baja lógica de usuarios** (`deleted_at`): conserva el historial de auditoría. El índice único del correo ignora los eliminados.
- **`access_logs.user_id` con `ON DELETE SET NULL`** y `email_attempted` siempre guardado: los intentos con correos inexistentes también quedan registrados.
- **Tokens y sesiones guardan solo hash**: una filtración de la BD no entrega sesiones ni enlaces válidos.
- `sector` es texto libre por ahora; cuando exista el mapa (Épica 2) conviene un catálogo de sectores.
