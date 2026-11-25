// Datos de ejemplo de la Épica 2 para probar y presentar: `npm run db:demo` (después de db:setup).
// Crea un usuario por rol (contraseña DEMO_PASSWORD) y reportes en todos los estados, usando los
// servicios reales: el historial, las notificaciones y la bitácora quedan como en el uso normal.
import { createServices } from '../services/index.js';
import { loadConfig } from '../config.js';
import { buildPermissionMap } from '../domain/permissions.js';
import { readFile } from 'node:fs/promises';
import { seedLicensingCatalog, seedOperationsCatalog, seedSystemRoles } from '../domain/seed-data.js';
import { hashPassword } from '../lib/passwords.js';
import { createPgRepos } from '../repositories/pg/index.js';
import { createPool } from './pool.js';

const config = loadConfig();
if (config.nodeEnv === 'production') {
  console.error('db:demo no se ejecuta con NODE_ENV=production.');
  process.exit(1);
}
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo-clave-123';
const PEOPLE = [
  ['ciudadano', 'Andrea Martínez', 'andrea@demo.local', 'Villa Mella'],
  ['ciudadano', 'Luis Peña', 'luis@demo.local', 'Los Alcarrizos'],
  ['supervisor', 'Carmen Rosario', 'supervisor@demo.local'],
  ['operador', 'José Familia', 'operador@demo.local'],
  ['operador', 'Rita Gómez', 'operador2@demo.local'],
  ['gerente', 'Pedro Almonte', 'gerente@demo.local'],
  ['auditor', 'Elena Cruz', 'auditor@demo.local'],
];

const pool = await createPool(config.databaseUrl);
try {
  const repos = createPgRepos(pool);
  await seedSystemRoles(repos);
  await seedOperationsCatalog(repos);
  await seedLicensingCatalog(repos);
  if (await repos.users.findByEmail('supervisor@demo.local')) {
    console.log('ℹ Los datos de ejemplo ya existen. Nada que hacer.');
  } else {
    const services = createServices({ repos, mailer: { async send() {} }, geoip: { lookup: () => null }, avatars: null, config });
    const as = {};
    const passwordHash = await hashPassword(PASSWORD);
    for (const [code, fullName, email, sector] of PEOPLE) {
      const role = await repos.roles.findByCode(code);
      const user = await repos.users.create({ fullName, email, sector, roleId: role.id, status: 'active', passwordHash });
      const principal = { user, role, permissions: buildPermissionMap(role, await repos.roles.getPermissions(role.id)) };
      as[email.split('@')[0]] = principal;
    }
    const { andrea, luis, supervisor: sup, operador: op, operador2: op2 } = as;
    const R = services.reports;
    const mk = (who, typeCode, title, location, description) => R.create(who, { typeCode, title, location, description });
    const go = (id, to, reason, who = sup) => R.transition(who, id, { to, reason });
    const assign = (id, who) => services.assignments.assign(sup, id, { assigneeId: who.user.id });

    await mk(andrea, 'alumbrado', 'Lámpara apagada', 'Calle 10, Villa Mella', 'La luminaria lleva tres noches apagada.');
    const b = await mk(luis, 'basura', 'Acumulación de basura', 'Av. Principal, Los Alcarrizos', 'El camión no pasa desde el lunes.');
    await go(b.id, 'validado');
    const c = await mk(andrea, 'agua', 'Fuga de agua', 'Calle Duarte esq. 5', 'Sale agua limpia de la acera desde ayer.');
    await go(c.id, 'validado'); await go(c.id, 'en_revision'); await assign(c.id, op2);
    const d = await mk(andrea, 'alumbrado', 'Poste de luz apagado', 'Calle 10, Villa Mella', 'Sin iluminación desde el lunes.');
    await go(d.id, 'validado'); await go(d.id, 'en_revision'); await assign(d.id, op); await go(d.id, 'en_proceso');
    await services.incidents.create(op, d.id, { category: 'material', priority: 'alta', description: 'No hay bombillas LED de 100 W en almacén.' });
    await services.approvals.request(op, d.id);
    const e = await mk(luis, 'vias', 'Hoyos en el pavimento', 'Calle 5', 'Tres hoyos grandes frente a la escuela.');
    await go(e.id, 'validado'); await go(e.id, 'en_revision'); await assign(e.id, op); await go(e.id, 'en_proceso');
    const ap = await services.approvals.request(op, e.id);
    await services.approvals.decide(sup, e.id, ap.rounds[0].steps[0].id, { decision: 'approved', comment: 'Bacheo verificado en sitio.' });
    await go(e.id, 'resuelto', undefined, op);
    const f = await mk(luis, 'basura', 'Basura en el solar', 'Calle 3', 'Reporte repetido del mismo solar.');
    await go(f.id, 'rechazado', 'Duplicado de otro reporte ya atendido.');
    // Épica 3: inventario con materiales y equipos, y movimientos ligados a los reportes.
    const I = services.inventory;
    const bulbs = await I.create(sup, { name: 'Bombilla LED 100 W', kind: 'material', unit: 'unidades', minStock: 5, location: 'Almacén central' });
    const pipe = await I.create(sup, { name: 'Tubo PVC 1/2 pulgada', kind: 'material', unit: 'metros', minStock: 20, location: 'Almacén central' });
    const asphalt = await I.create(sup, { name: 'Asfalto en frío', kind: 'material', unit: 'sacos', minStock: 10, location: 'Patio de obras' });
    const ladder = await I.create(sup, { name: 'Escalera telescópica', kind: 'equipo', unit: 'unidades', minStock: 1, location: 'Almacén central' });
    await I.create(sup, { name: 'Bolsas de basura industriales', kind: 'material', unit: 'paquetes', minStock: 3, location: 'Almacén central' });
    await I.move(sup, bulbs.id, { type: 'entrada', quantity: 12, reason: 'Compra OC-118' });
    await I.move(sup, pipe.id, { type: 'entrada', quantity: 60, reason: 'Compra OC-120' });
    await I.move(sup, asphalt.id, { type: 'entrada', quantity: 15, reason: 'Donación de la junta de vecinos' });
    await I.move(sup, ladder.id, { type: 'entrada', quantity: 2, reason: 'Compra OC-101' });
    await I.move(op, bulbs.id, { type: 'salida', quantity: 8, report: d.code, reason: 'Cambio de luminarias' });
    await I.move(op2, pipe.id, { type: 'salida', quantity: 6, report: c.code, reason: 'Reparación de la fuga' });
    await I.move(op, asphalt.id, { type: 'salida', quantity: 9, report: e.code, reason: 'Bacheo' });
    await I.move(sup, ladder.id, { type: 'asignacion', quantity: 1, assigneeId: op.user.id, report: d.code });
    console.log(`✔ Datos de ejemplo creados. Contraseña de todos: ${PASSWORD}`);
    for (const [code, name, email] of PEOPLE) console.log(`  ${code.padEnd(10)} ${email.padEnd(24)} ${name}`);
  }
  // ── Épica 4: licenciamiento (bloque propio: se agrega aunque ya existan los datos de las épicas 1 a 3) ──
  if (await repos.users.findByEmail('licencias@demo.local')) {
    console.log('ℹ Los datos de ejemplo de licenciamiento ya existen.');
  } else {
    const services = createServices({ repos, mailer: { async send() {} }, geoip: { lookup: () => null }, avatars: null, config });
    const asUser = async (email) => {
      const user = await repos.users.findByEmail(email);
      if (!user) return null;
      const role = await repos.roles.findById(user.roleId);
      return { user, role, permissions: buildPermissionMap(role, await repos.roles.getPermissions(role.id)) };
    };
    const role = await repos.roles.findByCode('licenciamiento');
    await repos.users.create({ fullName: 'Marta Licencias', email: 'licencias@demo.local', roleId: role.id, status: 'active', passwordHash: await hashPassword(PASSWORD) });
    const lic = await asUser('licencias@demo.local');
    const S = services.software;
    const L = services.licenses;
    const C = services.compliance;
    const lock = async (dir) => JSON.parse(await readFile(new URL(`../../../${dir}/package-lock.json`, import.meta.url), 'utf8'));

    // HU-4.2: el inventario sale de los package-lock.json reales del proyecto.
    const back = await S.importLockfile(lic, { projectCode: 'ciudadalerta-backend', lockfile: await lock('backend'), includeTransitive: true });
    const front = await S.importLockfile(lic, { projectCode: 'ciudadalerta-frontend', lockfile: await lock('frontend') });
    // Casos para revisar en la demostración: AGPL dentro de software comercial y un componente sin licencia.
    await S.createComponent(lic, { projectCode: 'municipal', name: 'Ghostscript', version: '10.04.0', kind: 'aplicacion', declaredLicense: 'AGPL-3.0-only', licenseId: 'AGPL-3.0-only', repositoryUrl: 'https://www.ghostscript.com' });
    await S.createComponent(lic, { projectCode: 'municipal', name: 'Visor de mapas interno', version: '2.1', kind: 'aplicacion' });
    // HU-4.5: una revisión ya cerrada, con su evidencia.
    const pg = (await S.listComponents({ project: 'ciudadalerta-backend', q: 'pg', direct: '1' })).items.find((c) => c.name === 'pg');
    const notice = await C.createEvidenceLink(lic, { title: 'LICENSE de node-postgres', kind: 'aviso', classification: 'publica', url: 'https://github.com/brianc/node-postgres/blob/master/LICENSE', componentId: pg?.id, projectCode: 'ciudadalerta-backend' });
    if (pg) await S.review(lic, pg.id, { decision: 'aprobado', obligations: 'Conservar el aviso de copyright MIT.', evaluation: 'Licencia MIT, compatible con el proyecto (MIT). Se distribuye solo en el servidor.', evidenceId: notice.id });

    // HU-4.3 / HU-4.4: licencias comerciales del municipio, una a punto de vencer.
    const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const m365 = await L.create(lic, { vendor: 'Microsoft', product: 'Microsoft 365', edition: 'E3', modality: 'suscripcion', metric: 'usuario', quantity: 5, startsOn: inDays(-345), expiresOn: inDays(20), alertDays: 30, licenseKey: 'M365-DEMO-KEY-0001', contractRef: 'CT-2025-114' });
    const arcgis = await L.create(lic, { vendor: 'Esri', product: 'ArcGIS Pro', edition: 'Standard', modality: 'suscripcion', metric: 'equipo', quantity: 2, startsOn: inDays(-60), expiresOn: inDays(305), alertDays: 45, contractRef: 'CT-2026-031' });
    await L.create(lic, { vendor: 'Adobe', product: 'Acrobat Pro', modality: 'perpetua', metric: 'usuario', quantity: 3, startsOn: inDays(-700) });
    for (const email of ['supervisor@demo.local', 'gerente@demo.local', 'licencias@demo.local']) {
      const u = await repos.users.findByEmail(email);
      if (u) await L.assign(lic, m365.id, { targetType: 'usuario', targetUserId: u.id });
    }
    await L.assign(lic, arcgis.id, { targetType: 'equipo', targetName: 'PC-GIS-01' });
    await C.createEvidenceLink(lic, { title: 'Contrato Microsoft 365 2025-2026', kind: 'contrato', classification: 'confidencial', url: 'https://docs.example.do/contratos/CT-2025-114', licenseId: m365.id });

    // HU-4.6: primera revisión de cumplimiento.
    const scan = await C.scan();
    console.log(`✔ Licenciamiento: ${back.created + front.created} componentes importados, 3 licencias adquiridas, ${scan.created} alertas.`);
    console.log(`  licenciamiento licencias@demo.local     Marta Licencias (contraseña ${PASSWORD})`);
  }
} finally {
  await pool.end();
}
