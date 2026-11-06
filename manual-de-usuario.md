# Manual de usuario — CiudadAlerta

CiudadAlerta es una plataforma para **reportar problemas de tu comunidad** (un bache, un poste apagado…) y seguirlos hasta que se resuelvan.
Este manual describe lo que la aplicación permite hacer hoy: **cuenta y acceso** (Épica 1) y **gestión de operaciones** (Épica 2: reportes, responsables, aprobaciones, plazos y alertas, incidencias, indicadores y bitácora). El mapa y las fotografías de los reportes todavía no están disponibles.

**Contenido**
1. [Instalación y puesta en marcha](#1-instalación-y-puesta-en-marcha) — para quien despliega el sistema
2. [Guía del ciudadano](#2-guía-del-ciudadano)
3. [Guía del administrador](#3-guía-del-administrador)
4. [Roles y permisos de un vistazo](#4-roles-y-permisos-de-un-vistazo)
5. [Problemas frecuentes](#5-problemas-frecuentes)

---

## 1. Instalación y puesta en marcha

### Qué necesitas
| Herramienta | Versión | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org) | 22.9 o superior | Ejecutar la API y la interfaz |
| [Docker Desktop](https://www.docker.com/products/docker-desktop) | cualquiera reciente | Base de datos PostgreSQL y bandeja de correos de prueba |
| [Git](https://git-scm.com) | cualquiera | Descargar el proyecto |

Comprueba las versiones con `node -v`, `docker -v` y `git --version`.

### Opción A — Modo desarrollo (la recomendada para el equipo)

**Paso 1. Descargar el proyecto**
```bash
git clone https://github.com/Dlex84/CiudadAlerta.git
cd CiudadAlerta
```

**Paso 2. Crear tu archivo de configuración**
```bash
cp .env.example .env        # en Windows (PowerShell): copy .env.example .env
```
Abre `.env` y revisa estas tres líneas, que definen **tu primer usuario administrador**:
```
SEED_ADMIN_NAME=Super Administrador
SEED_ADMIN_EMAIL=admin@ciudadalerta.local
SEED_ADMIN_PASSWORD=CambiaEstaClave-123
```
Cambia el correo y la contraseña por los tuyos. El archivo `.env` es privado: no se sube a Git.

**Paso 3. Encender la base de datos y la bandeja de correos**
```bash
docker compose up -d db mailpit
```
- `db` es PostgreSQL (puerto 5432).
- `mailpit` recibe los correos que envía el sistema (invitaciones y recuperación de contraseña) para que los veas en **http://localhost:8025** sin configurar un correo real.

**Paso 4. Instalar y preparar el backend**
```bash
cd backend
npm install
npm run db:setup
```
`db:setup` crea las tablas, los roles base (Super Administrador, Administrador, Supervisor, Ciudadano, Operador, Gerente y Auditor), los tipos de reporte con sus plazos y tu usuario administrador. Puedes ejecutarlo varias veces sin riesgo.

**(Opcional) Cargar datos de ejemplo.** Para ver la aplicación con vida (un usuario por rol y reportes en todos los estados):
```bash
npm run db:demo
```
Crea estos usuarios, todos con la contraseña `Demo-clave-123`:

| Correo | Rol |
|---|---|
| `andrea@demo.local` | Ciudadana |
| `supervisor@demo.local` | Supervisor |
| `operador@demo.local` | Operador |
| `gerente@demo.local` | Gerente |
| `auditor@demo.local` | Auditor |

> Úsalo solo en desarrollo o demostraciones: no lo ejecutes en un sistema real.

**Paso 5. Arrancar la API**
```bash
npm run dev
```
Debe aparecer `CiudadAlerta API escuchando en http://localhost:3000`. **Deja esta terminal abierta.**

**Paso 6. Arrancar la interfaz (en una segunda terminal)**
```bash
cd frontend
npm install
npm run dev
```
Abre **http://localhost:5173** en tu navegador. Inicia sesión con el correo y la contraseña del Paso 2.

### Opción B — Todo en contenedores (prueba rápida o demostración)
```bash
cp .env.example .env
docker compose --profile app up --build
```
Abre **http://localhost:3000**. La base de datos, las tablas y el administrador se crean solos. Para apagar: `docker compose --profile app down` (agrega `-v` si quieres borrar también los datos).

### Verificar que todo funciona
```bash
cd backend && npm test
```
Deben pasar todas las pruebas (más de 100). Para probar además contra PostgreSQL real, crea una base cuyo nombre contenga `test` y ejecuta `TEST_DATABASE_URL=postgres://ciudadalerta:ciudadalerta@localhost:5432/ciudadalerta_test npm test` (⚠ esa base se reinicia).

### Variables de configuración más útiles (`.env`)
| Variable | Qué controla | Por defecto |
|---|---|---|
| `SESSION_TTL_HOURS` | Cuánto dura una sesión abierta | 12 |
| `PASSWORD_RESET_TTL_MINUTES` | Vigencia del enlace de recuperación | 30 |
| `INVITE_TTL_HOURS` | Vigencia del enlace de invitación a usuarios nuevos | 72 |
| `RATE_LIMIT_MAX` | Intentos de login/registro por IP en 15 min | 20 |
| `SMTP_HOST` / `SMTP_PORT` | Servidor de correo real (vacío = los correos solo se imprimen en la consola de la API) | Mailpit |
| `ALERT_SCAN_MINUTES` | Cada cuántos minutos se revisan los reportes vencidos o por vencer (`0` desactiva las alertas) | 15 |
| `ALERT_DEDUPE_HOURS` | No repetir la misma alerta al mismo usuario dentro de esta ventana | 24 |
| `ALERT_EMAIL` | Enviar también las alertas por correo, además de la notificación en la app | true |
| `COOKIE_SECURE` | `true` cuando se sirve por HTTPS | false |
| `TRUST_PROXY` | `true` detrás de Nginx/Traefik para registrar la IP real | false |

### Poner el sistema en producción (resumen)
Usa la imagen del `Dockerfile`, una base PostgreSQL administrada, un servidor SMTP real (`SMTP_*`), HTTPS con `COOKIE_SECURE=true`, `APP_URL` con tu dominio público, `TRUST_PROXY=true` si hay un proxy y una contraseña de administrador nueva. Respalda el volumen de la base de datos y la carpeta de fotos (`UPLOADS_DIR`).

---

## 2. Guía del ciudadano

### 2.1 Crear una cuenta
1. En la pantalla de bienvenida pulsa **Comenzar**.

   ![Pantalla de bienvenida](manual/img/bienvenida.png)

2. Completa **nombre completo**, **correo electrónico**, **contraseña** (mínimo 8 caracteres) y, si quieres, tu **sector o comunidad**.
3. Marca **Acepto los términos y la política de privacidad**. Sin esta casilla el botón no se activa.
4. Pulsa **Crear mi cuenta**. Entrarás directamente a tu pantalla de inicio.

   ![Registro](manual/img/registro.png)

   En el celular se ve así: ![Registro en móvil](manual/img/registro-movil.png)

> Si el correo ya está registrado verás el aviso *«Ya existe un usuario con ese correo electrónico»*. Inicia sesión o recupera tu contraseña.

### 2.2 Iniciar sesión
1. Escribe tu correo y contraseña y pulsa **Entrar**.
2. El sistema te lleva a la pantalla que corresponde a tu rol (los ciudadanos van a **Inicio**; el personal de administración, al panel).

![Inicio de sesión](manual/img/login.png)

Si algún dato es incorrecto aparece *«Correo o contraseña incorrectos.»* (el mensaje es el mismo exista o no el correo, por seguridad):

![Error de credenciales](manual/img/login-error.png)

Si tu cuenta fue bloqueada verás *«Tu cuenta está bloqueada. Contacta al administrador.»* Por seguridad, tras demasiados intentos seguidos desde la misma conexión el sistema pide esperar unos minutos.

Tu sesión se cierra sola pasadas 12 horas (valor configurable): simplemente vuelve a entrar.

### 2.3 Recuperar tu contraseña
1. En el inicio de sesión pulsa **¿Olvidaste tu contraseña?**.
2. Escribe tu correo y pulsa **Enviar enlace**. Verás siempre el mismo mensaje, tengas o no cuenta.

   ![Solicitar enlace](manual/img/recuperar.png)

3. Revisa tu correo (y la carpeta de spam). El enlace **vence en 30 minutos** y **solo sirve una vez**.
4. Abre el enlace, escribe tu nueva contraseña dos veces y pulsa **Guardar contraseña**.

   ![Nueva contraseña](manual/img/restablecer.png)

5. Vuelves al inicio de sesión con un aviso de confirmación.

Notas: si pides varios enlaces, solo el último funciona. Al cambiar la contraseña se cierran tus sesiones abiertas en otros dispositivos.

### 2.4 Pantalla de inicio
Muestra tu sector, cifras reales de los reportes y el acceso para **crear un nuevo reporte**. La barra inferior te lleva a las demás secciones: **Inicio**, **Mis reportes**, **Notificaciones** y **Perfil**. El mapa y la exploración de reportes de otros vecinos no están disponibles todavía.

### 2.5 Tu perfil
Entra con **Perfil** en la barra inferior.

![Perfil](manual/img/perfil.png)

- **Cambiar fotografía:** pulsa el botón, elige una imagen JPG, PNG o WEBP de hasta 2 MB. Si no subes foto se muestran tus iniciales.
- **Datos personales:** puedes editar nombre completo, teléfono (opcional) y sector. Pulsa **Guardar cambios**; abajo se muestra la fecha de la última actualización. El correo no se puede cambiar desde aquí.
- **Cambiar contraseña:** escribe la contraseña actual y la nueva (mínimo 8 caracteres, distinta de la actual) y pulsa **Actualizar contraseña**. Tus otras sesiones se cierran, la actual sigue abierta.
- **Cerrar sesión:** botón al final de la pantalla.

### 2.6 Crear un reporte
1. Desde **Inicio** pulsa el botón para crear un nuevo reporte.
2. Elige el **tipo** de problema. Cada tipo tiene su propio plazo de atención.
3. Escribe un **título** corto, una **descripción** clara y la **ubicación** (calle, sector o referencia).
4. Envía el reporte. Si falta algún dato, el sistema te indica cuál y por qué.

Al enviarlo recibe un **código único** (por ejemplo, `CA-0001`) y queda en estado **Reportado**. Guarda el código: es la forma más fácil de referirte a tu reporte. En esta versión no se adjuntan fotos ni se marca el punto en un mapa.

### 2.7 Mis reportes y seguimiento
- **Mis reportes** lista solo los reportes que tú creaste, con su código y estado actual. Nadie más puede ver tu lista.
- Abre un reporte para ver su **seguimiento**: cada cambio de estado con su fecha y, cuando corresponde, el motivo (por ejemplo, por qué fue rechazado o devuelto).

**Estados de un reporte**

| Estado | Qué significa |
|---|---|
| Reportado | Lo enviaste y está pendiente de revisión |
| Validado | El equipo confirmó que el problema es real |
| En revisión | Se está analizando |
| En proceso | Ya tiene un responsable trabajando en él |
| Resuelto | El problema se solucionó (cierra el reporte) |
| Rechazado | No procede; se indica el motivo (cierra el reporte) |

Un reporte solo avanza por los cambios permitidos: no se puede saltar directamente a *Resuelto*, y para pasar a *En proceso* debe tener responsable.

### 2.8 Notificaciones
En **Notificaciones** ves los avisos de la aplicación, por ejemplo cuando tu reporte cambia de estado. Los avisos importantes también se envían a tu correo.

---

## 3. Guía del administrador

Si tu rol es Super Administrador, Administrador o Supervisor, al iniciar sesión entras al **panel de administración**. El menú lateral está agrupado y solo muestra las secciones a las que tu rol tiene acceso: las de **operaciones** (panel, reportes, aprobaciones, incidencias, plazos, reportes operativos y bitácora, ver 3.5 a 3.12), las de **administración** (*Usuarios*, *Roles y permisos*, *Auditoría de accesos*) y *Mi perfil* (igual al del ciudadano, ver 2.5). Los nombres exactos del menú pueden variar ligeramente. Para salir usa **Cerrar sesión** al fondo del menú.

### 3.1 Usuarios
![Lista de usuarios](manual/img/admin-usuarios.png)

**Buscar y filtrar.** Escribe parte del nombre o correo; filtra por **Estado** (activos/bloqueados) o por **Rol**. La lista está paginada.

**Crear un usuario.**
1. Pulsa **+ Nuevo usuario**.
2. Completa nombre, correo, teléfono (opcional), sector (opcional) y **Rol**.
3. Pulsa **Guardar**.

![Nuevo usuario](manual/img/admin-nuevo-usuario.png)

El usuario nace **Activo** y no tiene contraseña todavía: el sistema le envía un correo con un enlace (válido 72 horas) para que cree la suya. Mientras no lo use verás la etiqueta **Pendiente de activar**; puedes pulsar **Reenviar invitación** si no le llegó. El correo debe ser único.

**Editar.** Pulsa **Editar** para cambiar nombre, teléfono, sector o rol. El correo no se edita. No puedes cambiar tu propio rol.

**Bloquear.** Pulsa **Bloquear**, escribe el **motivo** (obligatorio) y confirma. El usuario pierde sus sesiones abiertas y no puede volver a entrar. Pasa el cursor sobre la etiqueta **Bloqueado** para ver el motivo.

![Usuario bloqueado](manual/img/admin-usuario-bloqueado.png)

**Reactivar.** Pulsa **Reactivar** en un usuario bloqueado; podrá entrar de nuevo.

**Eliminar.** Pulsa **Eliminar** y confirma. La cuenta deja de aparecer y su correo queda libre para reutilizarse; su historial de accesos se conserva.

Restricciones: no puedes bloquearte ni eliminarte a ti mismo, y solo un Super Administrador puede crear, editar, bloquear o eliminar a otros Super Administradores.

### 3.2 Roles
Un rol agrupa lo que puede hacer una persona. Cada rol indica a qué pantalla se envía a sus usuarios al iniciar sesión.

![Lista de roles](manual/img/admin-roles.png)

- **Nuevo rol:** nombre (único), descripción y destino al iniciar sesión (*App ciudadana* o *Panel de administración*). Un rol nuevo nace sin permisos: asígnalos con el botón **Permisos**.

  ![Nuevo rol](manual/img/admin-nuevo-rol.png)

- **Editar:** cambia nombre, descripción y destino. Los roles marcados **Sistema** (Super Administrador, Administrador, Supervisor, Ciudadano) solo permiten editar la descripción.
- **Desactivar / Activar:** un rol desactivado no puede asignarse a nuevos usuarios. Solo se puede desactivar si **no tiene usuarios activos**.
- **Eliminar:** solo roles propios y **sin ningún usuario asociado**. Si hay usuarios verás cuántos son; reasígnalos primero.

### 3.3 Permisos por rol
En la fila del rol pulsa **Permisos**. Aparece una tabla con cada módulo y cuatro casillas: **Crear, Consultar, Modificar, Eliminar**.

![Matriz de permisos](manual/img/admin-permisos.png)

1. Marca o desmarca las casillas.
2. Pulsa **Guardar permisos**.

**Los cambios rigen de inmediato**, incluso para personas que ya tienen la sesión abierta. Módulos: Usuarios, Roles, Permisos, Auditoría de accesos y Reportes ciudadanos (reservado para la siguiente entrega).

Reglas: el Super Administrador siempre tiene acceso total y no se puede modificar; nadie puede editar los permisos de **su propio** rol; para consultar o editar permisos tu rol necesita permiso sobre el módulo *Permisos* (por defecto solo el Super Administrador lo tiene).

### 3.4 Auditoría de accesos
Registra cada entrada y salida del sistema.

![Auditoría de accesos](manual/img/admin-auditoria.png)

| Columna | Significado |
|---|---|
| Fecha y hora | Cuándo ocurrió |
| Usuario | Persona y correo usado (los intentos con correos inexistentes aparecen como *Desconocido*) |
| Evento | **Inicio de sesión**, **Intento fallido**, **Acceso denegado** (cuenta bloqueada o rol inactivo) o **Cierre de sesión** |
| IP / Localización | Dirección desde la que se conectó y ciudad/país aproximados. Conexiones internas se muestran como *Red local* |
| Navegador | Chrome, Firefox, Edge, Safari u Otro |

Filtra por **correo**, **evento**, **IP** y rango de fechas (**Desde / Hasta**, ambos días incluidos) y pulsa **Filtrar**; **Limpiar** quita los filtros. Muchos *Intentos fallidos* seguidos desde una misma IP pueden indicar un intento de acceso indebido: considera bloquear la cuenta afectada.

### 3.5 Panel de operaciones
Resume el estado de los reportes con seis indicadores: **creados, pendientes, en proceso, completados, rechazados y vencidos**. Puedes aplicar filtros (los mismos de la lista de reportes) y el panel muestra la **fecha y hora de la última actualización**. Cada cifra coincide con lo que verás en la lista al aplicar el mismo filtro: si un indicador dice 7, la lista filtrada muestra 7 reportes.

> **«Vencido» no es un estado.** Es una condición que el sistema calcula: un reporte abierto cuyo plazo ya pasó. Un reporte vencido sigue estando, por ejemplo, *En proceso*.

### 3.6 Reportes: lista, ficha y cambio de estado
- La **lista** muestra todos los reportes (a diferencia del ciudadano, que solo ve los suyos) y se puede filtrar, por ejemplo por estado, tipo o responsable.
- Abre un reporte para ver su **ficha**: datos, estado, responsable, historial de estados, asignaciones, aprobaciones, incidencias y bitácora de ese reporte.
- Para **cambiar el estado** elige el nuevo estado entre los permitidos para el actual. Reglas:
  - **Rechazar** o **devolver** exige escribir un motivo; el ciudadano lo verá en su seguimiento.
  - Pasar a **En proceso** exige que el reporte tenga responsable.
  - **Resuelto** puede quedar bloqueado por aprobaciones pendientes o rechazadas (ver 3.8).
  - Si otra persona modificó el reporte mientras lo tenías abierto, el sistema lo avisa en lugar de pisar su cambio: recarga la ficha y vuelve a intentarlo.

### 3.7 Asignar y reasignar responsables
Desde la ficha del reporte puedes **asignar** un responsable o **reasignarlo**.
- Solo se puede asignar a usuarios **activos** y con permiso para atender reportes.
- Al **reasignar** escribe el **motivo**. Queda registrado quién asignó, a quién, cuándo y por qué.
- El nuevo responsable recibe una notificación (y el anterior, un aviso de que ya no es suyo).

### 3.8 Aprobaciones
Cada tipo de reporte puede exigir **pasos de aprobación** antes de resolverse (por ejemplo, la revisión de un supervisor). Los pasos se definen en la configuración (ver 3.9).
1. Quien atiende el reporte **solicita la aprobación** desde la ficha. Cada solicitud abre una nueva *ronda*.
2. Cada paso lo decide una persona con el rol indicado para ese paso, **en orden**. Puede **aprobar**, **rechazar** o **devolver para corrección**, y deja un comentario. Devolver exige explicar el motivo.
3. Mientras haya una aprobación obligatoria pendiente o rechazada, el reporte **no puede pasar a Resuelto**.
4. **Nadie puede aprobar su propio trabajo.**

En la sección de aprobaciones del panel ves las que están esperando tu decisión.

### 3.9 Plazos, aprobaciones y alertas (configuración)
Con permiso de configuración puedes definir, por **tipo de reporte**:
- El **plazo de atención** (en horas) y el **aviso previo** (cuántas horas antes de vencer se avisa).
- Los **pasos de aprobación**: su orden, el rol que decide cada uno y si es obligatorio.

**Alertas automáticas.** Cada cierto tiempo (por defecto, 15 minutos) el sistema revisa los reportes **por vencer** y **vencidos** y avisa a los involucrados dentro de la aplicación y por correo. Para no saturar, **no repite la misma alerta** al mismo usuario dentro de una ventana (por defecto, 24 horas). La misma pantalla muestra el **registro de envíos**: qué alerta se mandó, por qué canal y si salió bien o falló. Estos valores se ajustan en el `.env` (ver sección 1).

### 3.10 Incidencias
Una **incidencia** es un obstáculo operativo asociado a un reporte (falta de material, equipo averiado, acceso bloqueado, clima…). Se crean desde la ficha del reporte o desde la sección de incidencias.
- **Categoría:** material, equipo, personal, acceso, clima u otro.
- **Prioridad:** baja, media, alta o crítica.
- **Estado:** abierta → en atención → resuelta → cerrada.
- Tiene un **responsable** y una descripción. Para marcarla como **resuelta** debes documentar la **resolución**.
- Cada cambio y cada comentario queda en su **historial**.

### 3.11 Reportes operativos y exportación a CSV
Genera reportes de gestión con métricas sobre los reportes ciudadanos. Cada reporte muestra:
- La **definición escrita de cada métrica** (qué cuenta y cómo), para que todos lean lo mismo.
- Los **filtros usados** y la **fecha y hora de generación**.

Para **exportar a CSV** tu rol necesita el permiso de exportación (por defecto, el Gerente lo tiene). El archivo neutraliza las fórmulas de hoja de cálculo (seguro de abrir en Excel) y cada exportación queda registrada en la bitácora.

### 3.12 Bitácora de cambios
Registro **permanente e inmutable** de lo que ocurre en las operaciones. No existe forma de editarlo ni borrarlo, ni siquiera con acceso a la base de datos (un mecanismo lo impide).
Cada registro indica **quién** lo hizo, **cuándo**, sobre **qué** (reporte, incidencia, aprobación…), **qué acción**, el **resultado** (*exitoso* o *rechazado*) y los **valores antes y después** del cambio. También se registran los intentos que una regla rechazó. Nunca se guardan contraseñas ni tokens. Se puede filtrar por reporte, usuario, entidad, resultado y periodo.

> No confundir con la **Auditoría de accesos** (3.4), que registra inicios y cierres de sesión; la bitácora registra cambios en los datos.

### 3.13 Recorrido de ejemplo (con los datos de demostración)
Con `npm run db:demo` cargado (ver sección 1), puedes recorrer el ciclo completo:
1. **Andrea** (`andrea@demo.local`) crea un reporte desde su celular.
2. El **Supervisor** (`supervisor@demo.local`) lo valida y se lo asigna al Operador.
3. El **Operador** (`operador@demo.local`) lo pone *En proceso*, registra una incidencia y solicita la aprobación.
4. El **Supervisor** aprueba y marca el reporte como *Resuelto*. Andrea recibe el aviso.
5. El **Gerente** (`gerente@demo.local`) revisa el panel y exporta el CSV.
6. El **Auditor** (`auditor@demo.local`) revisa la bitácora y comprueba cada paso.

---

## 4. Roles y permisos de un vistazo

C = crear · R = consultar · U = modificar · D = eliminar. Es la configuración inicial; se puede cambiar desde *Roles y permisos*.

La Épica 2 agregó los roles **Operador** (atiende reportes y registra incidencias), **Gerente** (indicadores y exportación) y **Auditor** (consulta bitácora y auditoría), y siete módulos de permisos nuevos: *operaciones, asignaciones, aprobaciones, incidencias, configuración, indicadores y bitácora*. La tabla completa y actualizada de qué puede hacer cada rol está en [`roles-y-permisos.md`](roles-y-permisos.md); la que sigue resume solo los módulos de la Épica 1.

| Rol | Entra a | Usuarios | Roles | Permisos | Auditoría | Reportes |
|---|---|:-:|:-:|:-:|:-:|:-:|
| Super Administrador | Panel | CRUD | CRUD | CRUD | CRUD | CRUD |
| Administrador | Panel | CRUD | R | — | R | CRUD |
| Supervisor | Panel | R | — | — | R | RU |
| Ciudadano | App ciudadana | — | — | — | — | CR |

---

## 5. Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| `npm run db:setup` dice que no conecta | Comprueba que Docker está encendido y ejecuta `docker compose up -d db`. Espera unos segundos y reintenta. |
| El puerto 5432, 3000 o 5173 ya está en uso | Cierra el programa que lo usa (otro PostgreSQL local, otra instancia) o cambia el puerto en `docker-compose.yml` / `.env`. |
| `Unexpected token` o errores raros al arrancar | Tu Node es antiguo. Necesitas 22.9 o superior (`node -v`). |
| Entro, pero al recargar me pide iniciar sesión (producción) | Estás usando HTTP con `COOKIE_SECURE=true`, o `APP_URL` no coincide con el dominio real. Usa HTTPS o ajusta esas variables. |
| No llega el correo de invitación o recuperación | En desarrollo ábrelos en http://localhost:8025. Si configuraste SMTP, revisa `SMTP_*` y la consola de la API (los fallos de envío se registran ahí). Un administrador puede **Reenviar invitación**. |
| Olvidé la contraseña del administrador | Usa **¿Olvidaste tu contraseña?** y abre el correo en Mailpit/SMTP. Si no es posible, borra los datos con `docker compose down -v`, vuelve a ejecutar `npm run db:setup` y se creará de nuevo con el `.env` (⚠ pierde todos los datos). |
| `db:setup` no creó mi administrador | Solo lo crea si **no existe ningún** Super Administrador y si `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` están definidos. |
| «Demasiados intentos. Espera unos minutos» | Se superó el límite de intentos por IP. Espera 15 minutos (o sube `RATE_LIMIT_MAX` en desarrollo). |
| Mi foto no se sube | Debe ser JPG, PNG o WEBP de máximo 2 MB. |
| No puedo marcar un reporte como Resuelto | Tiene una aprobación obligatoria pendiente, rechazada o devuelta. Revisa la sección de aprobaciones de la ficha (3.8) y pide que se complete el paso. |
| No puedo pasar un reporte a «En proceso» | Primero asígnale un responsable (3.7). |
| «Vencido» no aparece como estado | Es normal: es una condición calculada (3.5). Filtra por vencidos en el panel. |
| No llegan las alertas de vencimiento | Revisa `ALERT_SCAN_MINUTES` (si es `0` están apagadas), `ALERT_EMAIL` y los envíos fallidos en la pantalla de plazos y alertas (3.9). |
| No veo el botón de exportar CSV | Tu rol no tiene el permiso de exportación (3.11). Pídele a un Super Administrador que lo active en *Roles y permisos*. |
| Un reporte «cambió mientras lo editaba» | Otra persona lo modificó antes. Recarga la ficha y repite el cambio. |
| Quiero empezar de cero en desarrollo | `docker compose down -v && docker compose up -d db mailpit && cd backend && npm run db:setup`. |

¿Algo no está aquí? Abre un *issue* en el repositorio con los pasos para reproducirlo.
