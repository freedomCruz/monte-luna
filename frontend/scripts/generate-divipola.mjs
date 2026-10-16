// Derives a trimmed DIVIPOLA dataset for the checkout address selectors
// from the canonical repository snapshot contracts/reference/divipola.json.
// License: CC BY-SA 4.0 (inherited from the source DANE dataset).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const referencePath = path.resolve(__dirname, '../../contracts/reference/divipola.json');
const outputPath = path.resolve(__dirname, '../src/generated/divipola.json');

if (!fs.existsSync(referencePath)) {
  console.error(`Reference DIVIPOLA file not found at ${referencePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(referencePath, 'utf-8');
const canonical = JSON.parse(raw);

if (!canonical.departments || !Array.isArray(canonical.departments)) {
  console.error('Invalid DIVIPOLA: missing departments array');
  process.exit(1);
}

if (!canonical.municipalities || !Array.isArray(canonical.municipalities)) {
  console.error('Invalid DIVIPOLA: missing municipalities array');
  process.exit(1);
}

const trimmedDepartments = canonical.departments.map((d) => ({
  code: d.code,
  display_name: d.display_name,
}));

const trimmedMunicipalities = canonical.municipalities.map((m) => ({
  code: m.code,
  department_code: m.department_code,
  display_name: m.display_name,
}));

const trimmed = {
  source: {
    publisher: canonical.source?.publisher ?? 'Departamento Administrativo Nacional de Estadística (DANE)',
    dataset: canonical.source?.dataset ?? 'DIVIPOLA - Códigos municipios',
    url: canonical.source?.url ?? 'https://www.datos.gov.co/d/gdxc-w37w',
    license: 'CC BY-SA 4.0',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    rows_updated_at: canonical.source?.rows_updated_at ?? '2025-01-24T20:44:32.000Z',
    notice: 'Trimmed for frontend checkout selectors. Official names and coordinates are in contracts/reference/divipola.json under CC BY-SA 4.0.',
  },
  departments: trimmedDepartments,
  municipalities: trimmedMunicipalities,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(trimmed, null, 2) + '\n', 'utf-8');

console.log(
  `Generated trimmed DIVIPOLA: ${trimmed.departments.length} departments, ${trimmed.municipalities.length} municipalities -> ${path.relative(process.cwd(), outputPath)}`
);
