// Helper module for DIVIPOLA dataset loaded on the checkout page.
// Dataset is derived from DANE (datos.gov.co) under CC BY-SA 4.0.

import divipolaData from '../generated/divipola.json';

export interface DivipolaDepartment {
  code: string;
  display_name: string;
}

export interface DivipolaMunicipality {
  code: string;
  department_code: string;
  display_name: string;
}

export interface DivipolaSource {
  publisher: string;
  dataset: string;
  url: string;
  license: string;
  license_url: string;
  rows_updated_at: string;
  notice: string;
}

export interface DivipolaDataset {
  source: DivipolaSource;
  departments: DivipolaDepartment[];
  municipalities: DivipolaMunicipality[];
}

export function getDivipolaData(): DivipolaDataset {
  return divipolaData as DivipolaDataset;
}

export function getDepartments(): DivipolaDepartment[] {
  return divipolaData.departments;
}

export function getMunicipalitiesByDepartment(departmentCode: string): DivipolaMunicipality[] {
  if (!departmentCode) return [];
  return divipolaData.municipalities.filter((m) => m.department_code === departmentCode);
}

export function getDepartmentByCode(code: string): DivipolaDepartment | undefined {
  if (!code) return undefined;
  return divipolaData.departments.find((d) => d.code === code);
}

export function getMunicipalityByCode(code: string): DivipolaMunicipality | undefined {
  if (!code) return undefined;
  return divipolaData.municipalities.find((m) => m.code === code);
}
