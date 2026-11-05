# ADR-002 — Sesiones opacas y permisos evaluados en cada request

**Estado:** propuesta · **Fecha:** 2026-11-04

## Contexto
HU-1.1 pide una «sesión segura» y HU-1.4 exige que los cambios de permisos «se apliquen inmediatamente». HU-1.6 exige que un bloqueo impida seguir usando el sistema.

## Decisión
Sesión **opaca** (token aleatorio en cookie `HttpOnly`) con hash en la tabla `sessions`; **no JWT**. Los permisos y el estado del usuario se leen de la BD en cada request.

## Por qué
- Un JWT lleva los permisos dentro y sigue válido hasta expirar: no cumpliría «inmediatamente» ni permitiría cerrar la sesión de un usuario bloqueado sin una lista de revocación (que es, en la práctica, una tabla de sesiones).
- La cookie `HttpOnly` no es legible por JavaScript (mitiga robo por XSS) y `SameSite=Lax` + validación de `Origin` mitigan CSRF.

## Costo
Unas pocas consultas por request (sesión, usuario, rol, permisos). Para la escala del proyecto es irrelevante; si hiciera falta, se cachea en memoria con invalidación explícita al cambiar roles/permisos.
