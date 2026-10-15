import { FormSelect } from '../ui/form-select';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';

export interface DepartmentMunicipalityFieldProps {
  departmentCode: string;
  municipalityCode: string;
  departments: DivipolaDepartment[];
  municipalities: DivipolaMunicipality[];
  departmentError?: string;
  municipalityError?: string;
  onDepartmentChange: (code: string) => void;
  onMunicipalityChange: (code: string) => void;
}

export function DepartmentMunicipalityField({
  departmentCode,
  municipalityCode,
  departments,
  municipalities,
  departmentError,
  municipalityError,
  onDepartmentChange,
  onMunicipalityChange,
}: DepartmentMunicipalityFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormSelect
          id="checkout-department"
          label="Departamento"
          value={departmentCode}
          onChange={(e) => onDepartmentChange(e.target.value)}
          error={departmentError}
        >
          <option value="">Selecciona un departamento</option>
          {departments.map((dept) => (
            <option key={dept.code} value={dept.code}>
              {dept.display_name}
            </option>
          ))}
        </FormSelect>

        <FormSelect
          id="checkout-municipality"
          label="Municipio o ciudad"
          disabled={!departmentCode}
          value={municipalityCode}
          onChange={(e) => onMunicipalityChange(e.target.value)}
          error={municipalityError}
        >
          <option value="">
            {departmentCode ? 'Selecciona tu municipio' : 'Primero elige departamento'}
          </option>
          {municipalities.map((muni) => (
            <option key={muni.code} value={muni.code}>
              {muni.display_name}
            </option>
          ))}
        </FormSelect>
      </div>

      {/* DIVIPOLA CC BY-SA 4.0 Attribution notice (S6) */}
      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
        <span>División político-administrativa de Colombia basada en datos oficiales de DANE (DIVIPOLA)</span>
        <span aria-hidden="true">·</span>
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/deed.es"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Licencia CC BY-SA 4.0
        </a>
      </p>
    </div>
  );
}
