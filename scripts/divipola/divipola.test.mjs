import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSnapshot, displayName } from './divipola.mjs';

test('displayName title-cases DIVIPOLA names with Spanish particles in lowercase', () => {
  const cases = [
    ['MEDELLÍN', 'Medellín'],
    ['ANTIOQUIA', 'Antioquia'],
    ['BOGOTÁ, D.C.', 'Bogotá, D. C.'],
    ['EL CARMEN DE VIBORAL', 'El Carmen de Viboral'],
    ['LA PLATA', 'La Plata'],
    ['SAN JOSÉ DE LA MONTAÑA', 'San José de la Montaña'],
    ['VALLE DEL CAUCA', 'Valle del Cauca'],
    ['BELÉN DE LOS ANDAQUÍES', 'Belén de los Andaquíes'],
    ['ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA', 'Archipiélago de San Andrés, Providencia y Santa Catalina'],
    ['PIENDAMÓ - TUNÍA', 'Piendamó - Tunía'],
    ['NARIÑO', 'Nariño'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(displayName(input), expected, input);
  }
});

const source = {
  url: 'https://www.datos.gov.co/d/gdxc-w37w',
  rows_updated_at: '2025-01-24T20:44:32.000Z',
};

const row = (cod_mpio, nom_mpio, cod_dpto, dpto, tipo_municipio = 'Municipio') => ({
  cod_dpto, dpto, cod_mpio, nom_mpio, tipo_municipio, longitud: '-75,5', latitud: '6,2',
});

test('buildSnapshot returns sorted departments and municipalities with official and display names', () => {
  const snapshot = buildSnapshot([
    row('11001', 'BOGOTÁ, D.C.', '11', 'BOGOTÁ, D.C.'),
    row('05002', 'ABEJORRAL', '05', 'ANTIOQUIA'),
    row('05001', 'MEDELLÍN', '05', 'ANTIOQUIA'),
    row('91263', 'EL ENCANTO', '91', 'AMAZONAS', 'Área no municipalizada'),
    row('88001', 'SAN ANDRÉS', '88', 'ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA', 'Isla'),
  ], source);

  assert.deepEqual(snapshot, {
    source: {
      publisher: 'Departamento Administrativo Nacional de Estadística (DANE)',
      dataset: 'DIVIPOLA - Códigos municipios',
      url: 'https://www.datos.gov.co/d/gdxc-w37w',
      license: 'CC BY-SA 4.0',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      rows_updated_at: '2025-01-24T20:44:32.000Z',
      notice: 'Display names are derived from the official names by title-casing; official names are unchanged.',
    },
    departments: [
      { code: '05', name: 'ANTIOQUIA', display_name: 'Antioquia' },
      { code: '11', name: 'BOGOTÁ, D.C.', display_name: 'Bogotá, D. C.' },
      { code: '88', name: 'ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA', display_name: 'Archipiélago de San Andrés, Providencia y Santa Catalina' },
      { code: '91', name: 'AMAZONAS', display_name: 'Amazonas' },
    ],
    municipalities: [
      { code: '05001', department_code: '05', name: 'MEDELLÍN', display_name: 'Medellín', type: 'municipality' },
      { code: '05002', department_code: '05', name: 'ABEJORRAL', display_name: 'Abejorral', type: 'municipality' },
      { code: '11001', department_code: '11', name: 'BOGOTÁ, D.C.', display_name: 'Bogotá, D. C.', type: 'municipality' },
      { code: '88001', department_code: '88', name: 'SAN ANDRÉS', display_name: 'San Andrés', type: 'island' },
      { code: '91263', department_code: '91', name: 'EL ENCANTO', display_name: 'El Encanto', type: 'non_municipalized_area' },
    ],
  });
});

test('buildSnapshot rejects inconsistent or unexpected source data', () => {
  const cases = [
    ['empty dataset', [], /no rows/],
    ['malformed municipality code', [row('5001', 'MEDELLÍN', '05', 'ANTIOQUIA')], /invalid municipality code "5001"/],
    ['municipality outside its department', [row('05001', 'MEDELLÍN', '08', 'ATLÁNTICO')], /municipality 05001 does not belong to department 08/],
    ['duplicate municipality', [row('05001', 'MEDELLÍN', '05', 'ANTIOQUIA'), row('05001', 'MEDELLÍN', '05', 'ANTIOQUIA')], /duplicate municipality code 05001/],
    ['department with two names', [row('05001', 'MEDELLÍN', '05', 'ANTIOQUIA'), row('05002', 'ABEJORRAL', '05', 'ANTIOQUÍA')], /department 05 has two names/],
    ['unknown municipality type', [row('05001', 'MEDELLÍN', '05', 'ANTIOQUIA', 'Corregimiento')], /unknown municipality type "Corregimiento" for 05001/],
    ['blank name', [row('05001', ' ', '05', 'ANTIOQUIA')], /blank name for municipality 05001/],
  ];
  for (const [name, rows, message] of cases) {
    assert.throws(() => buildSnapshot(rows, source), message, name);
  }
});
