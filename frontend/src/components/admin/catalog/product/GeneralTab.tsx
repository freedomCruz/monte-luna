import * as React from 'react';
import { Popover } from 'radix-ui';
import type { AdminBrand, AdminCategory, AdminOrigin, AdminProductStatus, AdminProductType } from '../../../../lib/admin/catalog';
import { productStatusPresentation } from '../../../../lib/admin/product-format';
import { publicationHelp } from '../../../../lib/admin/product-sheet';
import type { CreateErrors, ProductForm } from '../../../../lib/admin/product-form';
import { CARD, Field, FieldError, SelectBox, fieldClass } from './fields';

export interface Taxonomy {
  types: AdminProductType[];
  brands: AdminBrand[];
  origins: AdminOrigin[];
  categories: AdminCategory[];
}

interface GeneralTabProps {
  creating: boolean;
  form: ProductForm;
  onChange: (patch: Partial<ProductForm>) => void;
  taxonomy: Taxonomy;
  /** Product type of the saved product, or the one chosen while creating. */
  productType: AdminProductType | null;
  onProductType: (id: string) => void;
  errors: CreateErrors & { slugConflict?: string };
  /** Whether the slug still follows the title (creating only). */
  onTitleTyped?: (title: string) => void;
}

const STATUS_ORDER: AdminProductStatus[] = ['draft', 'published', 'archived'];
const PUBLISHED_HELP = publicationHelp('published');

function Publication({ status, onChange }: { status: AdminProductStatus; onChange: (status: AdminProductStatus) => void }) {
    return (
    <section aria-labelledby="h-pub" className={`${CARD} gap-3 p-5`}>
      <h2 id="h-pub" className="m-0 text-lg font-extrabold">Publicación</h2>
      <div role="radiogroup" aria-label="Estado" className="flex gap-1 rounded-sm bg-secondary p-1">
        {STATUS_ORDER.map((value) => (
          <label key={value} className={`relative inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-[6px] text-sm ${status === value ? 'border border-foreground bg-card font-bold' : 'font-semibold text-muted-foreground'} has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground`}>
            <input type="radio" name="status" value={value} checked={status === value} onChange={() => onChange(value)} className="sr-only" />
            {productStatusPresentation(value).label}
          </label>
        ))}
      </div>
      <span className="text-[13px] leading-[1.45] text-muted-foreground">{PUBLISHED_HELP} Archivar pide confirmación.</span>
    </section>
  );
}

function CategoryChips({ categories, selected, onChange }: { categories: AdminCategory[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const chosen = selected.map((id) => categories.find((category) => category.id === id) ?? { id, name: id });
  const available = categories.filter((category) => !selected.includes(category.id));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">Categorías</span>
      <span className="flex flex-wrap gap-1.5">
        {chosen.map((category) => (
          <span key={category.id} className="inline-flex h-9 items-center gap-1 rounded-sm bg-secondary pl-3 pr-1 text-sm font-bold">
            {category.name}
            <button type="button" aria-label={`Quitar ${category.name}`} onClick={() => onChange(selected.filter((id) => id !== category.id))} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-foreground"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </span>
        ))}
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild><button type="button" className="h-9 cursor-pointer rounded-sm border border-dashed border-muted-foreground bg-card px-3 font-sans text-sm font-bold text-foreground">+ Agregar</button></Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" sideOffset={6} className="z-50 flex max-h-72 w-64 flex-col overflow-y-auto rounded-md border border-border bg-popover p-1.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
              {available.length === 0 && <span className="px-2.5 py-2 text-sm text-muted-foreground">No quedan categorías por agregar.</span>}
              {available.map((category) => (
                <button key={category.id} type="button" onClick={() => { onChange([...selected, category.id]); setOpen(false); }} className="flex min-h-11 cursor-pointer items-center rounded-sm border-0 bg-transparent px-2.5 text-left font-sans text-[15px] text-foreground hover:bg-secondary">{category.name}</button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </span>
    </div>
  );
}

/** General tab (A-Producto): name, slug and description, plus Publicación and Organización. */
export function GeneralTab({ creating, form, onChange, taxonomy, productType, onProductType, errors, onTitleTyped }: GeneralTabProps) {
  const slugError = errors.slug ?? errors.slugConflict;
  return (
    <div role="tabpanel" aria-label="General" className="flex flex-wrap items-start gap-5">
      <section aria-label="Datos generales" className={`${CARD} min-w-0 flex-[2_1_480px] gap-[18px] p-6`}>
        <Field label="Nombre" error={errors.title}>
          <input type="text" value={form.title} aria-invalid={Boolean(errors.title) || undefined} onChange={(event) => { onChange({ title: event.target.value }); onTitleTyped?.(event.target.value); }} className={fieldClass(errors.title)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Slug</span>
            <span className={`flex h-11 items-center overflow-hidden rounded-sm ${slugError ? 'border-2 border-destructive' : 'border border-muted-foreground'}`}>
              <span className="inline-flex h-full items-center whitespace-nowrap bg-secondary px-2.5 text-sm text-muted-foreground">monteluna.co/productos/</span>
              <input type="text" aria-label="Slug" value={form.slug} aria-invalid={Boolean(slugError) || undefined} onChange={(event) => onChange({ slug: event.target.value })} className="h-full min-w-0 flex-1 border-0 bg-card px-2.5 font-sans text-[15px] text-foreground" />
            </span>
          </label>
          <span className="text-[13px] text-muted-foreground">Si lo cambias, los enlaces viejos dejan de funcionar.</span>
          <FieldError>{slugError}</FieldError>
        </div>
        <Field label="Descripción">
          <textarea rows={5} value={form.description} onChange={(event) => onChange({ description: event.target.value })} className="w-full resize-y rounded-sm border border-muted-foreground bg-card px-3 py-2.5 font-sans text-[15px] leading-6 text-foreground" />
        </Field>
      </section>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <Publication status={form.status} onChange={(status) => onChange({ status })} />
        <section aria-labelledby="h-org" className={`${CARD} gap-3.5 p-5`}>
          <h2 id="h-org" className="m-0 text-lg font-extrabold">Organización</h2>
          {creating ? (
            <Field label="Tipo de producto" hint="Define los atributos y las opciones de las variantes." error={errors.productTypeId}>
              <SelectBox value={productType?.id ?? ''} invalid={Boolean(errors.productTypeId)} onChange={(event) => onProductType(event.target.value)}>
                <option value="">Elige un tipo</option>
                {taxonomy.types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </SelectBox>
            </Field>
          ) : (
            <span className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Tipo de producto</span>
              <span className="flex h-11 items-center rounded-sm border border-dashed border-[color:var(--dashed)] bg-secondary px-3 text-[15px] text-muted-foreground">{productType?.name}</span>
              <span className="text-[13px] text-muted-foreground">Define los atributos y las opciones de las variantes.</span>
            </span>
          )}
          <Field label="Marca" optional>
            <SelectBox value={form.brandId} onChange={(event) => onChange({ brandId: event.target.value })}>
              <option value="">Sin marca</option>
              {taxonomy.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </SelectBox>
          </Field>
          <Field label="Origen" optional hint="Sin origen, el producto no enlaza a una historia.">
            <SelectBox value={form.originId} onChange={(event) => onChange({ originId: event.target.value })}>
              <option value="">Sin origen</option>
              {taxonomy.origins.map((origin) => <option key={origin.id} value={origin.id}>{[origin.name, origin.department].filter(Boolean).join(' · ')}</option>)}
            </SelectBox>
          </Field>
          <CategoryChips categories={taxonomy.categories} selected={form.categoryIds} onChange={(categoryIds) => onChange({ categoryIds })} />
        </section>
      </div>
    </div>
  );
}
