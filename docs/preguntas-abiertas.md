# Preguntas abiertas para el Product Owner

Cosas que encontramos al cruzar el backlog con el prototipo. Cada una tiene la **decisión provisional** que tomó el código, para que se pueda avanzar mientras se confirma.

| # | Tema | Decisión provisional | Confirmar |
|---|---|---|---|
| 1 | **Roles de la nota de HU-1.3.** Agente Inmobiliario, Arquitecto, Ingeniero y Cliente no encajan con CiudadAlerta. | Se sembraron *Super Administrador, Administrador, Supervisor y Ciudadano*. | ¿Hay roles de otro tipo (p. ej. cuadrillas municipales)? |
| 2 | **Registro de ciudadanos.** El prototipo tiene «Crear cuenta» pero ninguna HU. | Implementado como HU-1.9 propuesta; rol Ciudadano fijo. | ¿Se aprueba? ¿Hace falta verificar el correo? |
| 3 | **Contraseña de usuarios creados por admin** (HU-1.2 no lo define). | El usuario recibe un enlace para crearla (72 h). | ¿Prefieren contraseña temporal? |
| 4 | **Reglas de contraseña.** El prototipo solo dice «mínimo 8 caracteres». | Mínimo 8, máximo 128. | ¿Mayúscula, número, símbolo? |
| 5 | **Teléfono** aparece en HU-1.2 y HU-1.7 pero no en el registro del prototipo. | Opcional en todos lados; el registro ciudadano no lo pide. | ¿Obligatorio para algún rol? |
| 6 | **Foto de perfil**: el prototipo muestra iniciales. | Opcional; si no hay foto se muestran iniciales. | — |
| 7 | **Pantallas de administración** no existen en el prototipo (usuarios, roles, permisos, auditoría, recuperación de contraseña). | Se construyeron con el mismo estilo visual. | Diseñarlas en Figma |
| 8 | **Estados de un reporte.** Las listas usan Reportado / En revisión / Resuelto y el detalle añade «Validado por la comunidad»; el #CA-0028 aparece con dos estados distintos. | **Épica 2:** Reportado → Validado → En revisión → En proceso → Resuelto, más Rechazado. «Validado» lo hace el Supervisor (no la comunidad). | Ver #14–#17 |
| 9 | **Quién resuelve los reportes.** El prototipo dice «sin conexión gubernamental». | **Épica 2:** Supervisor (valida, asigna, aprueba) y Operador/Técnico (atiende lo asignado). | ¿Son cuadrillas municipales o voluntarios? |
| 10 | **Privacidad vs. HU-1.8.** El prototipo promete ubicación aproximada «por privacidad» y la auditoría guarda IP + ciudad. | Se guarda IP y localización por IP solo para auditoría de accesos, con base local (sin terceros). | Reflejarlo en la política de privacidad |
| 11 | **Retención de la auditoría.** | Se guarda indefinidamente. | ¿Cuántos meses? |
| 12 | **Sprints.** El backlog pone 47 SP en un solo Sprint 1. | Se propone Sprint 1 (29 SP) y Sprint 2 (18 SP). | Validar con el equipo |
| 13 | **Bloqueo «temporal».** HU-1.6 dice temporal pero no define duración. | Bloqueo manual hasta que un admin reactive. | ¿Se necesita fecha de fin automática? |

## Épica 2 — Gestión de operaciones

El plan pide validar en equipo los tipos, estados, aprobaciones, plazos y roles. Esto es lo que quedó en el código mientras se confirma:

| # | Tema | Decisión provisional | Confirmar |
|---|---|---|---|
| 14 | **Operación = reporte ciudadano.** | Así se implementó (plan, sección «Cómo aplicamos la épica»). | Con el profesor / PO |
| 15 | **«Vencido» como estado.** El plan lo lista entre los estados. | Es una **condición calculada** (abierto y con fecha límite pasada), no un estado. Ver [ADR-003](decisiones/ADR-003-operaciones.md). | ¿Se acepta? |
| 16 | **Plazos por tipo.** El backlog no los da. | Agua 24 h · Basura 48 h · Alumbrado 72 h · Vías públicas 168 h; aviso previo 4/8/12/24 h. Editables en *Plazos y aprobaciones*. | Valores reales |
| 17 | **Pasos de aprobación.** | Un paso obligatorio por tipo: «Visto bueno del supervisor». Configurable hasta 5 pasos. | ¿Algún tipo necesita más de uno? |
| 18 | **Ventana anti-repetición de alertas.** | 24 h (`ALERT_DEDUPE_HOURS`); revisión cada 15 min (`ALERT_SCAN_MINUTES`). | — |
| 19 | **Incidencias abiertas al resolver.** | No bloquean el cierre del reporte; se ven en la ficha y en los indicadores. | ¿Deberían bloquearlo? |
| 20 | **Fotografías y mapa** (pantallas 05, 06, 09). | Fuera de esta entrega; la ubicación es texto. | ¿Entran en la Épica 2 o en otra? |
| 21 | **Story points por historia.** El plan da 46 SP por parejas (13/10/13/10). | Se documentaron por pareja. | Reparto individual y prioridades |
| 22 | **Stack.** El plan proponía Express + SQLite. | Se mantuvo el de la Épica 1 (Node + PostgreSQL) para compartir base, sesión y permisos. | Con el equipo de la Épica 1 |
| 23 | **Texto de las historias.** El plan no copia el «Como… quiero…» del backlog del profesor. | Redacción provisional en cada `HU-2.x.md`. | Copiar el texto oficial |

## Épica 3 — Recursos e inventario

| # | Tema | Decisión provisional | Confirmar |
|---|---|---|---|
| 24 | **Enunciado de la épica.** La descripción recibida repite la de la Épica 1; solo la lista de la demostración habla de inventario. | Historias HU-3.1 a HU-3.6 derivadas de esa lista ([epica-3.md](backlog/epica-3.md)). | Backlog oficial del profesor |
| 25 | **Qué es un «recurso».** | Materiales (se consumen) y equipos (se prestan y se devuelven) del almacén municipal. | ¿Incluye personal o vehículos? |
| 26 | **Ajustes de inventario** (mermas, conteos físicos). | No hay movimiento de ajuste; se corrige con entradas o salidas con motivo. | ¿Hace falta un tipo «ajuste» con aprobación? |
| 27 | **Salida sin reporte.** | Toda salida de material exige el reporte que se atiende. | ¿Hay consumos internos sin reporte? |
