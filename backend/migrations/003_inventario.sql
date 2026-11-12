-- Épica 3: Gestión de recursos e inventario (materiales y equipos que usan las cuadrillas).
-- Los permisos de los módulos «recursos» y «movimientos» los siembra `npm run db:seed`.

-- HU-3.1: catálogo de recursos. La existencia (stock) solo cambia a través de un movimiento.
CREATE SEQUENCE resource_code_seq;
CREATE TABLE resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,                       -- REC-0001
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('material', 'equipo')),
  unit        text NOT NULL,
  stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0),  -- HU-3.4: nunca negativa
  min_stock   integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  location    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX resources_name_uq ON resources (lower(name));

-- HU-3.2 / HU-3.3 / HU-3.5: cada entrada, salida, asignación o devolución, con el saldo resultante.
CREATE TABLE inventory_movements (
  id            bigserial PRIMARY KEY,
  resource_id   uuid NOT NULL REFERENCES resources(id),
  type          text NOT NULL CHECK (type IN ('entrada', 'salida', 'asignacion', 'devolucion')),
  quantity      integer NOT NULL CHECK (quantity > 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  report_id     uuid REFERENCES reports(id),            -- salida o asignación para atender un reporte
  assignee_id   uuid REFERENCES users(id),              -- a quién se asignó / quién devolvió el equipo
  reason        text,
  actor_id      uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_resource_idx ON inventory_movements (resource_id, created_at DESC);
CREATE INDEX inventory_movements_created_idx ON inventory_movements (created_at DESC);
CREATE INDEX inventory_movements_report_idx ON inventory_movements (report_id);

-- HU-3.5: el historial es de solo inserción, igual que la bitácora de la Épica 2.
CREATE FUNCTION inventory_movements_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial de movimientos es de solo inserción (HU-3.5)' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_movements_no_update_delete
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_append_only();

CREATE TRIGGER inventory_movements_no_truncate
  BEFORE TRUNCATE ON inventory_movements
  FOR EACH STATEMENT EXECUTE FUNCTION inventory_movements_append_only();
