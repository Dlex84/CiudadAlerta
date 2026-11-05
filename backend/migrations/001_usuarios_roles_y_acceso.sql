-- Épica 1: Gestión de usuarios y acceso.
-- Requiere PostgreSQL 13+ (gen_random_uuid() viene incluido).

CREATE TABLE roles (
  id             serial PRIMARY KEY,
  code           text UNIQUE,                       -- solo roles del sistema (super_admin, admin, ...)
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  dashboard_path text NOT NULL DEFAULT '/inicio',   -- HU-1.1: a dónde se redirige al iniciar sesión
  is_active      boolean NOT NULL DEFAULT true,
  is_system      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_name_lower_uq ON roles (lower(name));

-- HU-1.4: matriz módulo x (crear, consultar, modificar, eliminar)
CREATE TABLE role_permissions (
  role_id    integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module     text NOT NULL,
  can_create boolean NOT NULL DEFAULT false,
  can_read   boolean NOT NULL DEFAULT false,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  PRIMARY KEY (role_id, module)
);

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          text NOT NULL,
  email              text NOT NULL,
  phone              text,
  sector             text,
  photo_url          text,
  password_hash      text,                          -- NULL = invitado que aún no define contraseña
  role_id            integer NOT NULL REFERENCES roles(id),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  blocked_reason     text,
  blocked_at         timestamptz,
  blocked_by         uuid REFERENCES users(id),
  last_login_at      timestamptz,
  profile_updated_at timestamptz,
  created_by         uuid REFERENCES users(id),
  deleted_at         timestamptz,                   -- eliminación lógica
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- Correo único sin distinguir mayúsculas, ignorando usuarios eliminados.
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX users_role_idx ON users (role_id);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,                  -- SHA-256 del token; el token en claro solo vive en la cookie
  ip         text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- HU-1.5: enlaces temporales de recuperación (y de invitación para usuarios creados por un admin)
CREATE TABLE password_reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose    text NOT NULL DEFAULT 'reset' CHECK (purpose IN ('reset', 'invite')),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens (user_id);

-- HU-1.8: auditoría de accesos
CREATE TABLE access_logs (
  id              bigserial PRIMARY KEY,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  email_attempted text,
  event           text NOT NULL CHECK (event IN ('login_success', 'login_failed', 'login_blocked', 'logout')),
  ip              text,
  country         text,
  city            text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_logs_created_idx ON access_logs (created_at DESC);
CREATE INDEX access_logs_user_idx ON access_logs (user_id);
CREATE INDEX access_logs_event_idx ON access_logs (event);
