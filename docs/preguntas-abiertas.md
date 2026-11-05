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
| 8 | **Estados de un reporte.** Las listas usan Reportado / En revisión / Resuelto y el detalle añade «Validado por la comunidad»; el #CA-0028 aparece con dos estados distintos. | Fuera de esta épica. | Definir la máquina de estados antes de la Épica 2 |
| 9 | **Quién resuelve los reportes.** El prototipo dice «sin conexión gubernamental». | El rol *Supervisor* queda como candidato (permiso `reportes`). | ¿Quién cambia estados? |
| 10 | **Privacidad vs. HU-1.8.** El prototipo promete ubicación aproximada «por privacidad» y la auditoría guarda IP + ciudad. | Se guarda IP y localización por IP solo para auditoría de accesos, con base local (sin terceros). | Reflejarlo en la política de privacidad |
| 11 | **Retención de la auditoría.** | Se guarda indefinidamente. | ¿Cuántos meses? |
| 12 | **Sprints.** El backlog pone 47 SP en un solo Sprint 1. | Se propone Sprint 1 (29 SP) y Sprint 2 (18 SP). | Validar con el equipo |
| 13 | **Bloqueo «temporal».** HU-1.6 dice temporal pero no define duración. | Bloqueo manual hasta que un admin reactive. | ¿Se necesita fecha de fin automática? |
