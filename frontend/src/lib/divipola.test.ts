import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getDivipolaData,
  getDepartments,
  getMunicipalitiesByDepartment,
  getDepartmentByCode,
  getMunicipalityByCode,
} from './divipola';

describe('DIVIPOLA trimmed dataset (S6)', () => {
  it('loads generated divipola.json with 33 departments and 1122 municipalities', () => {
    const data = getDivipolaData();
    expect(data.departments).toHaveLength(33);
    expect(data.municipalities).toHaveLength(1122);
    expect(data.source.license).toBe('CC BY-SA 4.0');
    expect(data.source.publisher).toContain('DANE');
  });

  it('verifies generated divipola.json matches canonical reference data', () => {
    const refPath = path.resolve(__dirname, '../../../contracts/reference/divipola.json');
    const canonical = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
    const data = getDivipolaData();

    expect(data.departments.map((d) => d.code)).toEqual(canonical.departments.map((d: { code: string }) => d.code));
    expect(data.departments.map((d) => d.display_name)).toEqual(
      canonical.departments.map((d: { display_name: string }) => d.display_name)
    );
    expect(data.municipalities.map((m) => m.code)).toEqual(
      canonical.municipalities.map((m: { code: string }) => m.code)
    );
  });

  it('filters municipalities by department code correctly', () => {
    // Antioquia code "05"
    const antioquiaMunis = getMunicipalitiesByDepartment('05');
    expect(antioquiaMunis.length).toBeGreaterThan(100);
    expect(antioquiaMunis.every((m) => m.department_code === '05')).toBe(true);

    // Bogotá code "11"
    const bogotaMunis = getMunicipalitiesByDepartment('11');
    expect(bogotaMunis).toHaveLength(1);
    expect(bogotaMunis[0].code).toBe('11001');
    expect(bogotaMunis[0].display_name).toBe('Bogotá, D. C.');
  });

  it('looks up department and municipality by code', () => {
    const huila = getDepartmentByCode('41');
    expect(huila).toBeDefined();
    expect(huila?.display_name).toBe('Huila');

    const pitalito = getMunicipalityByCode('41551');
    expect(pitalito).toBeDefined();
    expect(pitalito?.display_name).toBe('Pitalito');
    expect(pitalito?.department_code).toBe('41');
  });
});
