// Épica 4: catálogo inicial de licencias (HU-4.1). Resúmenes orientativos para el equipo, NO asesoría legal:
// cada registro guarda su fuente (SPDX) y la fecha de verificación (RN-4.2).
const VERIFIED = '2026-11-25';
const spdx = (id) => `https://spdx.org/licenses/${id}.html`;

export const LICENSE_CATALOG = [
  {
    spdxId: 'MIT', name: 'MIT License', version: null, category: 'permisiva',
    obligations: 'Conservar el aviso de copyright y el texto de la licencia en copias o partes sustanciales.',
    requiresAttribution: true, redistribution: 'permitida', modification: 'permitida', restrictions: 'Sin garantía.',
  },
  {
    spdxId: 'MIT-0', name: 'MIT No Attribution', version: null, category: 'permisiva',
    obligations: 'Ninguna obligación de atribución.',
    requiresAttribution: false, redistribution: 'permitida', modification: 'permitida', restrictions: 'Sin garantía.',
  },
  {
    spdxId: 'ISC', name: 'ISC License', version: null, category: 'permisiva',
    obligations: 'Conservar el aviso de copyright y el permiso.',
    requiresAttribution: true, redistribution: 'permitida', modification: 'permitida', restrictions: 'Sin garantía.',
  },
  {
    spdxId: 'BSD-2-Clause', name: 'BSD 2-Clause "Simplified" License', version: null, category: 'permisiva',
    obligations: 'Conservar el aviso de copyright en código fuente y binarios.',
    requiresAttribution: true, redistribution: 'permitida', modification: 'permitida', restrictions: 'Sin garantía.',
  },
  {
    spdxId: 'BSD-3-Clause', name: 'BSD 3-Clause "New" or "Revised" License', version: null, category: 'permisiva',
    obligations: 'Conservar el aviso de copyright en código fuente y binarios.',
    requiresAttribution: true, redistribution: 'permitida', modification: 'permitida',
    restrictions: 'No usar el nombre de los autores para promocionar productos derivados sin permiso.',
  },
  {
    spdxId: 'Apache-2.0', name: 'Apache License', version: '2.0', category: 'permisiva',
    obligations: 'Incluir copia de la licencia y el archivo NOTICE; indicar los archivos modificados.',
    requiresAttribution: true, redistribution: 'con_condiciones', modification: 'permitida',
    restrictions: 'No otorga uso de marcas. Concede licencia de patentes que termina si se inicia un litigio de patentes.',
  },
  {
    spdxId: '0BSD', name: 'BSD Zero Clause License', version: null, category: 'dominio_publico',
    obligations: 'Ninguna.', requiresAttribution: false, redistribution: 'permitida', modification: 'permitida', restrictions: 'Sin garantía.',
  },
  {
    spdxId: 'Unlicense', name: 'The Unlicense', version: null, category: 'dominio_publico',
    obligations: 'Ninguna.', requiresAttribution: false, redistribution: 'permitida', modification: 'permitida', restrictions: 'Sin garantía.',
  },
  {
    spdxId: 'CC-BY-4.0', name: 'Creative Commons Attribution', version: '4.0', category: 'permisiva',
    obligations: 'Dar crédito al autor, enlazar la licencia e indicar si hubo cambios. Pensada para contenidos, no para código.',
    requiresAttribution: true, redistribution: 'permitida', modification: 'permitida', restrictions: 'No agregar restricciones adicionales.',
  },
  {
    spdxId: 'MPL-2.0', name: 'Mozilla Public License', version: '2.0', category: 'copyleft_debil',
    obligations: 'Los archivos MPL modificados se publican con su código fuente bajo MPL.',
    requiresAttribution: true, redistribution: 'con_condiciones', modification: 'con_condiciones', restrictions: 'Copyleft a nivel de archivo.',
  },
  {
    spdxId: 'LGPL-3.0-only', name: 'GNU Lesser General Public License', version: '3.0', category: 'copyleft_debil',
    obligations: 'Permitir reemplazar la librería; publicar las modificaciones a la librería bajo LGPL.',
    requiresAttribution: true, redistribution: 'con_condiciones', modification: 'con_condiciones', restrictions: 'El enlace estático requiere más cuidado.',
  },
  {
    spdxId: 'GPL-3.0-only', name: 'GNU General Public License', version: '3.0', category: 'copyleft_fuerte',
    obligations: 'Al distribuir, entregar el código fuente de toda la obra derivada bajo GPL-3.0.',
    requiresAttribution: true, redistribution: 'con_condiciones', modification: 'con_condiciones',
    restrictions: 'La obra derivada completa debe licenciarse como GPL.',
  },
  {
    spdxId: 'AGPL-3.0-only', name: 'GNU Affero General Public License', version: '3.0', category: 'copyleft_fuerte',
    obligations: 'Como GPL-3.0 y además ofrecer el código fuente a los usuarios que usen el software por red.',
    requiresAttribution: true, redistribution: 'con_condiciones', modification: 'con_condiciones',
    restrictions: 'Aplica también a servicios web.',
  },
  {
    spdxId: 'LicenseRef-Propietaria', name: 'Licencia propietaria (EULA del fabricante)', version: null, category: 'propietaria',
    obligations: 'Las que fije el contrato o EULA de cada producto.',
    requiresAttribution: false, redistribution: 'prohibida', modification: 'prohibida', restrictions: 'Uso limitado a lo adquirido.',
  },
].map((l) => ({ ...l, sourceUrl: l.spdxId.startsWith('LicenseRef-') ? null : spdx(l.spdxId), verifiedOn: VERIFIED }));

/** Proyectos cuyo software se inventaría. CiudadAlerta se publica bajo MIT (ver LICENSE). */
export const SOFTWARE_PROJECTS = [
  { code: 'ciudadalerta-backend', name: 'CiudadAlerta · API (backend)', licenseSpdx: 'MIT', repositoryUrl: 'https://github.com/Dlex84/CiudadAlerta/tree/main/backend' },
  { code: 'ciudadalerta-frontend', name: 'CiudadAlerta · App web (frontend)', licenseSpdx: 'MIT', repositoryUrl: 'https://github.com/Dlex84/CiudadAlerta/tree/main/frontend' },
  { code: 'municipal', name: 'Software municipal (comercial)', licenseSpdx: 'LicenseRef-Propietaria', repositoryUrl: null },
];
