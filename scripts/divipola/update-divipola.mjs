// Downloads the official DANE DIVIPOLA dataset from datos.gov.co and rewrites
// contracts/reference/divipola.json. Run only when DANE publishes changes:
//   task divipola:update
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildSnapshot } from './divipola.mjs';

const DATASET = 'gdxc-w37w';
const ROWS_URL = `https://www.datos.gov.co/resource/${DATASET}.json?$limit=5000&$order=cod_mpio`;
const METADATA_URL = `https://www.datos.gov.co/api/views/${DATASET}.json`;
const OUTPUT = fileURLToPath(new URL('../../contracts/reference/divipola.json', import.meta.url));

const HELP = `Usage: node scripts/divipola/update-divipola.mjs
Download the DANE DIVIPOLA dataset (datos.gov.co ${DATASET}) and rewrite
contracts/reference/divipola.json. Requires network access.
`;

async function getJSON(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
  return response.json();
}

async function main() {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  const [rows, metadata] = await Promise.all([getJSON(ROWS_URL), getJSON(METADATA_URL)]);
  const snapshot = buildSnapshot(rows, {
    url: `https://www.datos.gov.co/d/${DATASET}`,
    rows_updated_at: new Date(metadata.rowsUpdatedAt * 1000).toISOString(),
  });
  await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `Wrote ${snapshot.departments.length} departments and ${snapshot.municipalities.length} municipalities to contracts/reference/divipola.json\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`divipola update failed: ${error.message}\n`);
  process.exitCode = 1;
});
