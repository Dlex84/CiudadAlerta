# Épica 3 — Gestión de recursos e inventario

**Objetivo:** controlar los materiales y equipos que usan las cuadrillas para atender los reportes ciudadanos: qué hay, qué entra, qué sale, quién tiene cada equipo y qué falta.

> El enunciado recibido repite la descripción de la Épica 1; las historias se derivaron de la lista «Durante la demostración en vivo» (registrar y consultar recursos, entradas/salidas o asignaciones, validar disponibilidad, historial de movimientos y reportes de existencias). Redacción provisional: ver [preguntas abiertas](../preguntas-abiertas.md) #24.

| HU | Historia | Criterios de aceptación | Pruebas |
|---|---|---|---|
| **HU-3.1** | Como supervisor quiero **registrar y consultar recursos** para saber con qué cuenta el almacén. | Código único `REC-0001`; nombre único (sin distinguir mayúsculas); tipo *material* (se consume) o *equipo* (se presta); unidad, mínimo y ubicación; búsqueda por nombre/código, tipo y «bajo mínimo»; desactivar sin borrar. La existencia **no se edita a mano**. | `hu-3.x-inventario.test.js` |
| **HU-3.2** | Como supervisor quiero **registrar entradas** (compras, donaciones) para mantener la existencia al día. | Cantidad entera > 0; origen obligatorio; suma a la existencia y guarda el saldo resultante. | ídem |
| **HU-3.3** | Como operador quiero **registrar salidas de material y asignaciones/devoluciones de equipo** vinculadas al reporte que atiendo. | La salida exige el reporte `CA-0000`; los equipos se asignan a un usuario con permiso de atender reportes y se devuelven; no se puede devolver más de lo que esa persona tiene. | ídem + `pg-integration.test.js` |
| **HU-3.4** | Como operador quiero **validar la disponibilidad** antes de retirar para no prometer lo que no hay. | `GET /resources/:id/availability`; la pantalla avisa al escribir la cantidad; el servidor rechaza con `409 insufficient_stock` (con lo disponible) y la existencia **nunca queda negativa**, aun con retiros simultáneos (una sola sentencia SQL + `CHECK (stock >= 0)`); aviso en la app a quien gestiona el inventario cuando un recurso queda bajo el mínimo o agotado. | ídem (10 retiros simultáneos sobre 5 unidades) |
| **HU-3.5** | Como auditor quiero **consultar el historial de movimientos** para saber quién movió qué y cuándo. | Tipo, cantidad, saldo después, reporte, persona, autor, motivo y fecha; filtros por recurso, tipo, reporte y periodo; **solo inserción** (trigger en PostgreSQL). | ídem |
| **HU-3.6** | Como gerente quiero **generar reportes de existencias y movimientos** para planificar compras. | Totales (disponibles, bajo mínimo, agotados, movimientos del periodo); por recurso: existencia, mínimo, estado y entradas/salidas/asignaciones/devoluciones del periodo; fecha de generación; exportación CSV (queda en la bitácora). | ídem |

## Permisos (módulos nuevos)

| Rol | `recursos` | `movimientos` |
|---|---|---|
| Super Administrador | CRUD | CRUD |
| Administrador | CRUD | CR |
| Supervisor | CRU | CR |
| Operador / Técnico | R | CR |
| Gerente · Auditor | R | R |
| Ciudadano | — | — |

## Demostración en vivo
`npm run db:demo` crea 5 recursos (bombillas, tubo PVC, asfalto, escalera, bolsas) con entradas, salidas ligadas a reportes y una escalera asignada. Entra como `supervisor@demo.local` → **Recursos e inventario**.

1. Registrar y consultar: *+ Nuevo recurso*, buscar, filtrar «Solo bajo mínimo».
2. Entradas/salidas/asignaciones: *Registrar movimiento* (salida con `CA-0004`; asignar la escalera).
3. Validar disponibilidad: escribir una cantidad mayor que la existencia → aviso y botón deshabilitado.
4. Historial: pestaña *Historial de movimientos*, filtrar por recurso o reporte.
5. Reportes: pestaña *Existencias y reportes* → *Exportar CSV*.

Evidencia: [`docs/evidencia/epica-3/`](../evidencia/epica-3/).
