# ADR-004 — Licenciamiento de software (Épica 4)

**Estado:** aceptada · 25/11/2026

## Contexto
El backlog pide inventariar componentes y licencias, revisar obligaciones Open Source, controlar licencias compradas y alertar a tiempo, «marcando incompatibilidades para revisión humana, no como dictamen legal». Pregunta además si hay que importar manifests o SBOM.

## Decisiones
1. **Inventariar el propio CiudadAlerta.** Se importan sus `package-lock.json` reales: el inventario no es inventado y se demuestra con el código del curso. Formatos SBOM (CycloneDX, SPDX) quedan para después.
2. **El sistema marca, no dictamina.** Las reglas de RN-4.9 son pocas y explícitas: la categoría del componente frente a la del proyecto. Toda marca dice que requiere revisión humana, y solo una persona cierra el pendiente con una revisión registrada.
3. **Confidencialidad como permiso aparte (`confidencial`).** Ver una licencia no implica ver su clave o su contrato. Se filtra en el servicio, no en la pantalla, y las evidencias confidenciales responden 404 para no revelar que existen.
4. **Cupos atómicos en la base.** El control de cantidad es un `UPDATE` condicional más un `INSERT` en una sola sentencia, respaldado por un `CHECK`. Evita la carrera de dos asignaciones simultáneas sin bloqueos explícitos; es el mismo patrón que la existencia de la Épica 3.
5. **Historial de solo inserción.** Revisiones, evidencias y seguimiento de alertas tienen triggers que impiden modificar o borrar, como la bitácora de la Épica 2. Una evidencia nueva es una versión nueva.
6. **Alertas deduplicadas en dos niveles:** índice único parcial para las pendientes y ventana configurable (`dedupe_days`) para no repetir una ya atendida.

## Costos y pendientes
- El contador `assigned` duplica información de `license_assignments`; la pantalla de conciliación verifica que coincidan.
- Las reglas de compatibilidad no cubren casos finos entre licencias copyleft (por ejemplo GPL-2.0-only con Apache-2.0); por eso siempre terminan en revisión humana.
- Los archivos de evidencias se guardan en disco local; en producción se cambiaría el adaptador por almacenamiento de objetos.
