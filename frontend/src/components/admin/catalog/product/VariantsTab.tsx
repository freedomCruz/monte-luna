import * as React from 'react';
import type { AdminProduct, AdminVariant } from '../../../../lib/admin/catalog';
import { ADMIN_ROUTES } from '../../../../lib/admin/navigation';
import { TAX_CATEGORIES, pesosToMinor, type TaxCategory, type VariantErrors, type VariantForm } from '../../../../lib/admin/product-form';
import { variantParts } from '../../../../lib/admin/product-sheet';
import { formatMoneyCop } from '../../../../lib/shared/formatters';
import { CARD, FieldError, MoneyInput, OUTLINE_BUTTON, SelectBox } from './fields';
import { VariantSheet } from './VariantSheet';

interface VariantsTabProps {
  product: AdminProduct;
  drafts: Record<string, VariantForm>;
  errors: Record<string, VariantErrors>;
  onDraft: (id: string, patch: Partial<VariantForm>) => void;
  /** Creates a variant now; resolves to an error message, or null on success. */
  onCreate: (form: VariantForm) => Promise<string | null>;
}

// Columns per width from the A-Producto artboards: 1440 shows every column; below it
// the barcode, weight, tax and status move into the "Más" Sheet.
const FROM_1440 = 'hidden min-[1440px]:table-cell';
const TH = 'whitespace-nowrap px-2 text-left font-bold';
const INPUT = 'h-11 rounded-sm border border-muted-foreground bg-card px-2 font-sans text-sm text-foreground';

function StockCell({ variant }: { variant: AdminVariant }) {
  const out = variant.available_quantity === 0;
  return (
    <span className="inline-flex flex-col items-end gap-[3px] pt-1">
      <a href={`${ADMIN_ROUTES.inventory}?search=${encodeURIComponent(variant.sku)}`} aria-label={`Stock de ${variant.sku}: ${variant.available_quantity}. Ver en Inventario`} className="font-extrabold underline underline-offset-[3px]">{variant.available_quantity}</a>
      {(out || variant.low_stock) && <span className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-sm px-2 text-xs font-bold ${out ? 'bg-destructive text-card' : 'bg-brand-yellow text-foreground'}`}>{out ? 'Agotado' : 'Poco stock'}</span>}
    </span>
  );
}

/** Variantes tab (A-Producto): editable table with price, reference price and read-only stock. */
export function VariantsTab({ product, drafts, errors, onDraft, onCreate }: VariantsTabProps) {
  const [sheet, setSheet] = React.useState<{ kind: 'create' } | { kind: 'edit'; id: string } | null>(null);
  const definitions = product.product_type.attribute_definitions;

  return (
    <section role="tabpanel" aria-label="Variantes" className={CARD}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-border px-5 py-4 text-sm leading-[1.45]">
        <span className="min-w-[280px] flex-1"><span className="font-extrabold">Precio de referencia:</span> el «antes» tachado. Debe ser mayor que el precio y activa el badge «Ahorras $X» en la tienda. Déjalo vacío para quitarlo.</span>
        <span className="min-w-[280px] flex-1"><span className="font-extrabold">Categoría de impuesto:</span> Excluido, Exento, Reducido o General. La tarifa la aplica el sistema según la ley vigente; si dudas, pregúntale a tu contador.</span>
        <button type="button" onClick={() => setSheet({ kind: 'create' })} className={OUTLINE_BUTTON}>Nueva variante</button>
      </div>
      {product.variants.length === 0 ? (
        <p className="m-0 px-5 py-8 text-[15px] text-muted-foreground">Este producto todavía no tiene variantes.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-sm min-[1440px]:min-w-[1100px]">
            <thead>
              <tr className="bg-secondary font-condensed text-[13px] uppercase tracking-[0.08em]">
                <th className="h-11 pl-5 pr-3 text-left font-bold">Variante</th>
                <th className={TH}>SKU</th>
                <th className={`${TH} ${FROM_1440}`}>Código de barras</th>
                <th className={`${TH} ${FROM_1440}`}>Peso (g)</th>
                <th className={TH}>Precio</th>
                <th className={TH}>Precio de referencia</th>
                <th className={`${TH} ${FROM_1440}`}>Impuesto</th>
                <th className={`${TH} ${FROM_1440}`}>Estado</th>
                <th className="px-2 text-right font-bold">Stock</th>
                <th className="w-14 min-[1440px]:hidden"><span className="sr-only">Más</span></th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const form = drafts[variant.id];
                const rowErrors = errors[variant.id] ?? {};
                const [first, ...rest] = variantParts(variant, definitions);
                const name = [first, ...rest].filter(Boolean).join(' ') || variant.sku;
                const price = pesosToMinor(form.price);
                const compareAt = pesosToMinor(form.compareAt);
                const saving = price !== null && compareAt !== null && compareAt > price ? compareAt - price : null;
                return (
                  <tr key={variant.id} className="border-t border-border align-top">
                    <td className="py-2.5 pl-5 pr-3"><span className="flex flex-col pt-1"><span className="whitespace-nowrap font-extrabold">{first ?? variant.sku}</span>{rest.length > 0 && <span className="text-[13px] text-muted-foreground">{rest.join(' · ')}</span>}</span></td>
                    <td className="px-2 py-2.5">
                      <input type="text" value={form.sku} aria-label={`SKU de ${name}`} aria-invalid={Boolean(rowErrors.sku) || undefined} onChange={(event) => onDraft(variant.id, { sku: event.target.value })} className={`${INPUT} w-[150px] ${rowErrors.sku ? 'border-2 border-destructive' : ''}`} />
                      <FieldError>{rowErrors.sku}</FieldError>
                    </td>
                    <td className={`px-2 py-2.5 ${FROM_1440}`}><input type="text" inputMode="numeric" value={form.barcode} placeholder="Opcional" aria-label={`Código de barras de ${name}`} onChange={(event) => onDraft(variant.id, { barcode: event.target.value })} className={`${INPUT} w-[140px]`} /></td>
                    <td className={`px-2 py-2.5 ${FROM_1440}`}>
                      <input type="text" inputMode="numeric" value={form.weight} aria-label={`Peso en gramos de ${name}`} aria-invalid={Boolean(rowErrors.weight) || undefined} onChange={(event) => onDraft(variant.id, { weight: event.target.value })} className={`${INPUT} w-[72px] text-right ${rowErrors.weight ? 'border-2 border-destructive' : ''}`} />
                    </td>
                    <td className="px-2 py-2.5"><MoneyInput value={form.price} label={`Precio de ${name}`} invalid={Boolean(rowErrors.price)} onChange={(price) => onDraft(variant.id, { price })} /><FieldError>{rowErrors.price}</FieldError></td>
                    <td className="px-2 py-2.5">
                      <span className="flex flex-col gap-1">
                        <MoneyInput value={form.compareAt} placeholder="—" label={`Precio de referencia de ${name}`} invalid={Boolean(rowErrors.compareAt)} onChange={(compareAt) => onDraft(variant.id, { compareAt })} />
                        {saving !== null && !rowErrors.compareAt && <span className="text-xs font-bold text-success">Ahorras {formatMoneyCop(saving)}</span>}
                        {rowErrors.compareAt && <span role="alert" className="max-w-[140px] text-xs font-bold leading-[1.3] text-destructive">{rowErrors.compareAt}</span>}
                      </span>
                    </td>
                    <td className={`px-2 py-2.5 ${FROM_1440}`}>
                      <SelectBox value={form.tax} aria-label={`Categoría de impuesto de ${name}`} invalid={Boolean(rowErrors.tax)} onChange={(event) => onDraft(variant.id, { tax: event.target.value as TaxCategory | '' })} className="!w-[150px] !pl-2 !pr-7 !text-sm">
                        <option value="">Elige una</option>
                        {TAX_CATEGORIES.map((tax) => <option key={tax.value} value={tax.value}>{tax.label}</option>)}
                      </SelectBox>
                    </td>
                    <td className={`px-2 py-2.5 ${FROM_1440}`}>
                      <select value={form.status} aria-label={`Estado de ${name}`} onChange={(event) => onDraft(variant.id, { status: event.target.value as VariantForm['status'] })} className={`mt-[9px] h-[26px] cursor-pointer appearance-none rounded-sm border-0 px-2.5 font-sans text-xs font-bold ${form.status === 'active' ? 'bg-success text-card' : 'bg-secondary text-foreground'}`}>
                        <option value="active">Activa</option>
                        <option value="archived">Archivada</option>
                      </select>
                    </td>
                    <td className="px-2 py-2.5 text-right"><StockCell variant={variant} /></td>
                    <td className="px-2 py-2.5 min-[1440px]:hidden">
                      <button type="button" onClick={() => setSheet({ kind: 'edit', id: variant.id })} aria-label={`Más datos de ${name}`} className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border border-muted-foreground bg-card text-foreground"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sheet?.kind === 'create' && <VariantSheet mode="create" definitions={definitions} onClose={() => setSheet(null)} onCreate={async (form) => { const failure = await onCreate(form); if (!failure) setSheet(null); return failure; }} />}
      {sheet?.kind === 'edit' && (() => {
        const variant = product.variants.find((item) => item.id === sheet.id)!;
        return <VariantSheet mode="edit" title={variantParts(variant, definitions).join(' · ') || variant.sku} form={drafts[variant.id]} onApply={(form) => onDraft(variant.id, form)} onClose={() => setSheet(null)} />;
      })()}
    </section>
  );
}
