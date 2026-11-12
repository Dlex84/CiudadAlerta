// Datos de ejemplo de la Épica 2 para probar y presentar: `npm run db:demo` (después de db:setup).
// Crea un usuario por rol (contraseña DEMO_PASSWORD) y reportes en todos los estados, usando los
// servicios reales: el historial, las notificaciones y la bitácora quedan como en el uso normal.
import { createServices } from '../services/index.js';
import { loadConfig } from '../config.js';
import { buildPermissionMap } from '../domain/permissions.js';
import { seedOperationsCatalog, seedSystemRoles } from '../domain/seed-data.js';
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
} finally {
  await pool.end();
}
