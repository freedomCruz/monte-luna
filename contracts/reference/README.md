# Reference data

Versioned reference data shared by the backend and the frontend. Each side keeps its own copy inside its directory and checks that the copy equals the file here.

## `divipola.json`

Colombian departments and municipalities (DIVIPOLA) used by checkout address selectors, shipping zones, and server-side municipality validation.

- **Source:** "DIVIPOLA - Códigos municipios", Departamento Administrativo Nacional de Estadística (DANE), published on datos.gov.co: https://www.datos.gov.co/d/gdxc-w37w
- **License:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/
- **Changes:** fields renamed to English `snake_case`; coordinates dropped; municipality types mapped to `municipality`, `non_municipalized_area`, and `island`; `display_name` added by title-casing the official name. Official names are kept unchanged in `name`. This adapted file is distributed under the same CC BY-SA 4.0 license.
- **Update:** `task divipola:update` downloads the dataset and rewrites the file (network required). Review the diff and update both consumer copies in the same change.
- **Generator:** `scripts/divipola/` (`task scripts:test` runs its tests).
