# Épica 4 — Gestión de Licenciamientos de Software

**Objetivo (backlog del profesor):** mantener un inventario trazable de productos y componentes, licencias, condiciones, asignaciones, vencimientos y evidencias.
**Alcance:** catálogo, inventario, licencias adquiridas, asignación, revisión de obligaciones, alertas y reportes.

## 1. Cómo aplicamos la épica a CiudadAlerta

CiudadAlerta es software libre (licencia MIT) hecho para una materia de tecnologías Open Source, así que la épica se aplica a **su propio software** y al software comercial que usa el municipio:

| Concepto del backlog | En CiudadAlerta |
|---|---|
| Aplicaciones y librerías | Las dependencias reales del proyecto, importadas de `backend/package-lock.json` y `frontend/package-lock.json`, más el software municipal registrado a mano. |
| Proyecto | `ciudadalerta-backend` (MIT), `ciudadalerta-frontend` (MIT) y `municipal` (software comercial). Cada proyecto tiene su propia licencia, que se usa para detectar posibles incompatibilidades. |
| Licencias propietarias | Las que compra el municipio: Microsoft 365 por usuario, ArcGIS Pro por equipo, Acrobat Pro perpetua… |
| Responsable de licenciamiento | Rol nuevo `licenciamiento` (ver [roles y permisos](../roles-y-permisos.md)). |
| Gerente · Auditor · Administrador | Roles existentes, con permisos nuevos de consulta, exportación o administración. |

## 2. Modelado funcional

### Módulos

| Módulo | Historias | Qué resuelve | Pantalla (*Licencias y cumplimiento*) |
|---|---|---|---|
| Catálogo de licencias | HU-4.1 | Qué permite y qué exige cada licencia, según qué fuente y desde cuándo | Catálogo de licencias |
| Inventario de software | HU-4.2 | Qué componentes usa cada proyecto, de dónde vienen y con qué licencia | Inventario de software |
| Revisión de obligaciones | HU-4.5 | Qué decidió una persona sobre cada componente, con qué evidencia | Ficha del componente |
| Licencias adquiridas | HU-4.3 | Qué compró el municipio, cuántas y hasta cuándo | Licencias adquiridas |
| Asignación y conciliación | HU-4.4 | Quién usa cada licencia y si cuadran las cantidades | Ficha de la licencia · Conciliación |
| Alertas de cumplimiento | HU-4.6 | Qué vence o está pendiente, quién lo atiende y qué se hizo | Alertas |
| Evidencias | HU-4.7 | Dónde está el contrato, el aviso o el informe que respalda cada decisión | Evidencias |
| Reportes | HU-4.8 | Foto del inventario y de los riesgos a una fecha de corte | Reportes |

### Proceso de cumplimiento Open Source

```mermaid
flowchart LR
  A[Importar package-lock.json<br/>o registrar a mano] --> B{¿Licencia declarada<br/>única y en el catálogo?}
  B -- sí --> C[Confirmada]
  B -- varias o desconocida --> D[Revisión pendiente]
  B -- ninguna --> E[Sin licencia]
  C --> F{¿Posible<br/>incompatibilidad?}
  F -- sí --> G[Alerta crítica<br/>para revisión humana]
  F -- no --> H[Alerta: revisar obligaciones<br/>si es dependencia directa]
  D --> I[Alerta: sin licencia confirmada]
  E --> I
  G --> J[Revisión: decisión, obligaciones,<br/>evaluación, revisor y evidencia]
  H --> J
  I --> J
  J -- aprobado / con condiciones / rechazado --> K[Pendiente cerrado<br/>y licencia confirmada]
  J -- requiere revisión legal --> G
```

### Proceso de licencias adquiridas

```mermaid
flowchart LR
  A[Registrar licencia:<br/>proveedor, producto, cantidad,<br/>modalidad, vigencia] --> B[Asignar a usuario,<br/>equipo o aplicación]
  B --> C{¿Métrica correcta, vigente<br/>y con cupo?}
  C -- no --> X[Rechazo con motivo<br/>y registro en bitácora]
  C -- sí --> D[Asignación vigente]
  D --> E[Liberar o reasignar<br/>con motivo: queda historial]
  A --> F[Alerta de vencimiento<br/>N días antes]
  F --> G[Responsable, seguimiento<br/>y atención]
```

### Entidades

`license_types` (catálogo) · `software_projects` · `software_components` · `component_reviews` · `purchased_licenses` · `license_assignments` · `license_evidences` · `compliance_alert_rules` · `compliance_alerts` · `compliance_alert_events`. El diagrama entidad-relación y sus restricciones están en el [modelo de datos](../modelo-datos.md#épica-4--gestión-de-licenciamientos).

## 3. Historias de usuario

Texto del backlog del profesor; los criterios se verifican en `backend/test/hu-4.x-licenciamientos.test.js` (20 pruebas) y `backend/test/pg-integration.test.js`.

| HU | Historia | SP | Criterios de aceptación (verificables) | Reglas |
|---|---|---|---|---|
| **HU-4.1** Catálogo de licencias | Como responsable de licenciamiento quiero mantener licencias Open Source y propietarias para conocer sus condiciones. | 8 | Registrar nombre, tipo (SPDX), versión, fuente y resumen de obligaciones · categoría de la clasificación aprobada · atribución, redistribución, modificación y restricciones · fuente y fecha de verificación. Se siembran 14 licencias (MIT, Apache-2.0, GPL-3.0…). | RN-4.1, RN-4.2 |
| **HU-4.2** Inventario de software | Como administrador quiero registrar aplicaciones y librerías para conocer su procedencia y licencia. | 8 | Nombre, versión, repositorio, tipo y proyecto · asociar licencia o marcar revisión pendiente · fecha y responsable de incorporación · duplicados potenciales por nombre y versión · importación de `package-lock.json`. | RN-4.3, RN-4.4 |
| **HU-4.3** Licencias propietarias | Como encargado quiero registrar licencias comerciales y condiciones para controlar vigencia y uso. | 8 | Proveedor, producto, edición, cantidad, modalidad y vigencia · cantidades asignadas y disponibles · alertas de vencimiento con días de aviso por licencia · claves y contratos restringidos. | RN-4.6, RN-4.8 |
| **HU-4.4** Asignación y conciliación | Como administrador quiero asignar licencias a usuarios, equipos o aplicaciones para controlar su uso. | 8 | Destinatario, fecha y responsable · valida límite, métrica y vigencia · liberar o reasignar con motivo conservando historial · conciliación adquiridas / asignadas / disponibles. | RN-4.5 |
| **HU-4.5** Revisión de obligaciones OSS | Como responsable técnico quiero revisar obligaciones de dependencias para reducir riesgos de incumplimiento. | 8 | Obligaciones por componente y versión · componentes sin licencia confirmada · evaluación, decisión, revisor y evidencia · incompatibilidades potenciales **para revisión humana, no como dictamen legal**. | RN-4.7, RN-4.9 |
| **HU-4.6** Alertas de cumplimiento | Como responsable quiero recibir alertas de vencimientos y revisiones para actuar a tiempo. | 5 | Reglas por fecha, tipo y criticidad · pendientes, atendidas y vencidas · responsable y seguimiento · sin duplicados dentro de la ventana configurada. | RN-4.12 |
| **HU-4.7** Evidencias | Como auditor quiero consultar evidencias para verificar la trazabilidad de decisiones. | 5 | Adjuntar o enlazar contratos, avisos, atribuciones e informes · autor, fecha, versión y componente · acceso según clasificación · búsqueda por proyecto o componente. | RN-4.10, RN-4.11 |
| **HU-4.8** Reportes | Como gerente quiero generar reportes para planificar renovaciones y revisiones. | 5 | Por tipo de licencia, proyecto, proveedor, estado y vencimiento · sin licencia confirmada y revisiones pendientes · exportación para autorizados · fecha de corte y filtros. | RN-4.8 |

## 4. Reglas de negocio

«Dónde» indica qué capa la hace cumplir: **BD** = restricción de PostgreSQL (se cumple aunque alguien salte la API) · **Servicio** = `backend/src/services/`.

| # | Regla | Dónde | Prueba |
|---|---|---|---|
| RN-4.1 | Cada licencia tiene un identificador SPDX (o `LicenseRef-…`) único sin distinguir mayúsculas, y una categoría de la clasificación aprobada: permisiva, copyleft débil, copyleft fuerte, dominio público, propietaria u otra. | BD `UNIQUE`, `CHECK` · Servicio | HU-4.1 |
| RN-4.2 | Marcar una licencia como verificada exige la fuente consultada y una fecha no futura. Si cambian sus condiciones sin nueva verificación, vuelve a «sin verificar». | BD `CHECK` · Servicio | HU-4.1 |
| RN-4.3 | Un componente queda **confirmado** solo con una licencia del catálogo. Si el manifest declara varias (`MIT OR Apache-2.0`) o una desconocida, queda **revisión pendiente** para que una persona decida; si no declara ninguna, **sin licencia**. | BD `CHECK` · Servicio | HU-4.2 |
| RN-4.4 | Un mismo nombre (sin mayúsculas) y versión no se repite dentro de un proyecto; en otro proyecto se registra y se avisa como **duplicado potencial**. | BD índice único · Servicio | HU-4.2 |
| RN-4.5 | Una asignación debe coincidir con la métrica de la licencia (usuario, equipo o aplicación), con la licencia activa y vigente; nunca se asignan más de las adquiridas, aun con solicitudes simultáneas; un destinatario no tiene dos asignaciones vigentes de la misma licencia; la cantidad no puede bajar de lo ya asignado. Liberar exige motivo y conserva la fila. | BD `CHECK assigned <= quantity`, índice único parcial, `UPDATE` condicional atómico · Servicio | HU-4.4 · PostgreSQL (10 simultáneas sobre 3) |
| RN-4.6 | Una suscripción siempre tiene vencimiento, posterior al inicio. Vigencia: **vencida** si pasó la fecha, **por vencer** dentro de los días de aviso de esa licencia, si no **vigente**. | BD `CHECK` · `domain/licensing.js` | HU-4.3 |
| RN-4.7 | Una revisión exige decisión, obligaciones, evaluación y revisor; aprobar exige indicar la licencia aplicable, que queda confirmada. La evidencia es opcional pero debe existir. Las decisiones aprobado, con condiciones o rechazado cierran el pendiente; «requiere revisión legal» no. | Servicio · BD solo inserción | HU-4.5 |
| RN-4.8 | Claves de licencia y referencias de contrato solo las ven y registran usuarios con el permiso `confidencial`; para los demás llegan vacías y marcadas como restringidas. Nunca se escriben en la bitácora. | Servicio · bitácora con redacción | HU-4.3 · transversal |
| RN-4.9 | Se marca **posible incompatibilidad** cuando hay copyleft fuerte en un proyecto permisivo o propietario (salvo dependencias de desarrollo), un componente propietario en un proyecto abierto o una licencia sin categoría. Es una ayuda para la revisión humana, **no un dictamen legal**; así se indica en la pantalla, la alerta y el CSV. | `domain/licensing.js` | HU-4.5 |
| RN-4.10 | Una evidencia es un enlace http(s) o un archivo PDF, PNG, JPG o de texto de hasta 5 MB, cuyo tipo se verifica por su contenido; siempre se relaciona con un proyecto, componente o licencia. Las **confidenciales** no existen (404) para quien no tiene el permiso `confidencial`; los archivos no tienen ruta pública. | BD `CHECK` · Servicio | HU-4.7 |
| RN-4.11 | Revisiones, evidencias y seguimiento de alertas son de solo inserción: una versión nueva es otra fila. Toda acción, también la rechazada, queda en la bitácora de cambios. | BD triggers · Servicio | PostgreSQL · transversal |
| RN-4.12 | No hay dos alertas **pendientes** del mismo tipo para la misma licencia o componente, ni se repite una alerta dentro de la ventana de su regla aunque ya esté atendida. Atender exige comentario. Vencida = pendiente con la fecha límite pasada. | BD índice único parcial · Servicio | HU-4.6 · PostgreSQL |

## 5. Respuestas a las preguntas de refinamiento

| Pregunta del backlog | Decisión provisional |
|---|---|
| ¿Se requiere importar SBOM, manifests o inventarios? | Sí: se importa `package-lock.json` (npm, versiones 2 y 3), directas por defecto o el árbol completo. Otros formatos (CycloneDX, SPDX) quedan anotados en [preguntas abiertas](../preguntas-abiertas.md). |
| ¿Qué política define la aprobación de licencias y la escalación? | Las reglas RN-4.9 y RN-4.12 con criticidad configurable; la decisión «requiere revisión legal» mantiene el pendiente abierto. |
| ¿Quién valida las interpretaciones y decisiones? | El rol **Responsable de licenciamiento** (o un administrador). El sistema nunca aprueba ni rechaza solo: marca, alerta y registra quién decidió y con qué evidencia. |

## 6. Demostración en vivo

`npm run db:setup` y `npm run db:demo` crean el usuario `licencias@demo.local` (contraseña `Demo-clave-123`), importan las dependencias reales del proyecto (50 componentes), registran 3 licencias comerciales (Microsoft 365 a punto de vencer), un componente AGPL en software comercial y otro sin licencia, y generan las primeras alertas.

1. **Inventario:** importar `frontend/package-lock.json` (no repite nada) y filtrar «Posible incompatibilidad».
2. **Revisión:** abrir Ghostscript, leer el aviso y registrar la revisión con evidencia.
3. **Licencias adquiridas:** asignar ArcGIS Pro a un equipo hasta llenar el cupo; ver la conciliación.
4. **Confidencialidad:** entrar como `gerente@demo.local`: ve la licencia pero no la clave ni el contrato.
5. **Alertas:** asignar responsable, dar seguimiento y atender el vencimiento de Microsoft 365.
6. **Reportes:** filtrar y exportar el CSV con fecha de corte.

Evidencia: [`docs/evidencia/epica-4/`](../evidencia/epica-4/).
