# ADR-001 — Stack tecnológico

**Estado:** propuesta (modificable por el equipo) · **Fecha:** 2026-11-04

## Contexto
Proyecto académico de la materia *Desarrollo de Software con Tecnología Open Source*. Equipo pequeño; se prioriza que todos puedan leer y mantener el código, y que sea 100 % open source y reproducible con Docker.

## Decisión
- **Node.js 22 + PostgreSQL 16.** Postgres da índices parciales, `uuid`, transacciones y, más adelante, **PostGIS** para el mapa de reportes.
- **Backend con muy pocas dependencias** (`pg`, `nodemailer`, `geoip-lite`): HTTP con `node:http`, hash con `node:crypto` (scrypt), pruebas con `node:test`. Menos superficie de ataque y menos cosas que actualizar.
- **React + Vite** para la interfaz; rutas por hash para servir la SPA desde cualquier lugar.
- **Repositorios detrás de una interfaz** (`pg` en producción, memoria en pruebas).
- **SQL plano versionado** (`migrations/NNN_*.sql`) en vez de un ORM: fácil de revisar en PR y didáctico.

## Consecuencias
- (+) Pruebas rápidas sin base de datos; el CI además valida contra Postgres real.
- (−) Router, validación y migraciones son código propio; si el proyecto crece, migrar a Fastify/Express + zod + una herramienta de migraciones es directo porque la lógica vive en `services/`.
- (−) Sin TypeScript; hay JSDoc mínimo. Pasar a TS es una opción si el equipo lo desea.

## Alternativas consideradas
Django (muy completo, pero habría que ceñirse a su modelo de usuarios/permisos), Express + Prisma (más estándar, más dependencias y generación de código), Laravel/Spring (válidos; depende de la experiencia del equipo).
> Si el equipo ya domina otro stack, este es el momento de cambiarlo: el modelo de datos, la API (`docs/api.md`) y las reglas de negocio se conservan.
