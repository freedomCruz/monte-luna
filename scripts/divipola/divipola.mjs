// Pure helpers that turn the official DANE DIVIPOLA dataset into the
// repository snapshot contracts/reference/divipola.json. No network access here;
// see update-divipola.mjs for the explicit download step.

const LOWERCASE_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);

const MUNICIPALITY_TYPES = new Map([
  ['Municipio', 'municipality'],
  ['Área no municipalizada', 'non_municipalized_area'],
  ['Isla', 'island'],
]);

// Title-cases an official upper-case DIVIPOLA name. Spanish particles stay in
// lowercase unless they start the name or a hyphen-separated segment.
export function displayName(officialName) {
  const lower = officialName.trim().toLocaleLowerCase('es-CO').replace(/\bd\.c\./g, 'D. C.');
  let segmentStart = true;
  return lower
    .split(' ')
    .map((word) => {
      if (word === '-') {
        segmentStart = true;
        return word;
      }
      const keepLower = !segmentStart && LOWERCASE_PARTICLES.has(word);
      segmentStart = false;
      if (keepLower || word === 'D.') return word;
      return word.charAt(0).toLocaleUpperCase('es-CO') + word.slice(1);
    })
    .join(' ');
}

export function buildSnapshot(rows, source) {
  if (rows.length === 0) throw new Error('DIVIPOLA dataset has no rows');

  const departments = new Map();
  const municipalities = new Map();
  for (const row of rows) {
    const code = row.cod_mpio;
    const departmentCode = row.cod_dpto;
    if (!/^[0-9]{5}$/.test(code)) throw new Error(`invalid municipality code "${code}"`);
    if (!/^[0-9]{2}$/.test(departmentCode)) throw new Error(`invalid department code "${departmentCode}" for ${code}`);
    if (code.slice(0, 2) !== departmentCode) {
      throw new Error(`municipality ${code} does not belong to department ${departmentCode}`);
    }
    if (municipalities.has(code)) throw new Error(`duplicate municipality code ${code}`);
    const name = (row.nom_mpio ?? '').trim();
    const departmentName = (row.dpto ?? '').trim();
    if (name === '') throw new Error(`blank name for municipality ${code}`);
    if (departmentName === '') throw new Error(`blank name for department ${departmentCode}`);
    const type = MUNICIPALITY_TYPES.get(row.tipo_municipio);
    if (type === undefined) throw new Error(`unknown municipality type "${row.tipo_municipio}" for ${code}`);

    const knownDepartment = departments.get(departmentCode);
    if (knownDepartment !== undefined && knownDepartment !== departmentName) {
      throw new Error(`department ${departmentCode} has two names`);
    }
    departments.set(departmentCode, departmentName);
    municipalities.set(code, { code, department_code: departmentCode, name, display_name: displayName(name), type });
  }

  const byCode = (a, b) => a.code.localeCompare(b.code);
  return {
    source: {
      publisher: 'Departamento Administrativo Nacional de Estadística (DANE)',
      dataset: 'DIVIPOLA - Códigos municipios',
      url: source.url,
      license: 'CC BY-SA 4.0',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      rows_updated_at: source.rows_updated_at,
      notice: 'Display names are derived from the official names by title-casing; official names are unchanged.',
    },
    departments: [...departments]
      .map(([code, name]) => ({ code, name, display_name: displayName(name) }))
      .sort(byCode),
    municipalities: [...municipalities.values()].sort(byCode),
  };
}
