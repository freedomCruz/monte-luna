import * as React from 'react';
import { AlertDialog } from 'radix-ui';
import { getAdminProduct, updateAdminProduct, type AdminProduct, type AdminProductStatus } from '../../../lib/admin/catalog';
import { productDetailHref } from '../../../lib/admin/navigation';
import { isVersionConflict } from '../../../lib/admin/orders';
import { productStatusPresentation } from '../../../lib/admin/product-format';
import { PRODUCT_STATUSES } from '../../../lib/admin/products-query';
import { activeVariants, publicationHelp, variantPresentation } from '../../../lib/admin/product-sheet';
import { formatMoneyCop } from '../../../lib/shared/formatters';
import { AdminSheet } from '../shared/AdminSheet';
import { DiscardChangesDialog } from '../shared/DiscardChangesDialog';
import { useUnsavedChangesGuard } from '../shared/unsaved-changes';

interface ProductSheetProps {
  productId: string;
  /** Title of the list row, shown while the product loads. */
  fallbackTitle: string;
  onClose: () => void;
  /** Called with the saved product so the list can refresh. */
  onSaved: (product: AdminProduct) => void;
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; product: AdminProduct; etag: string };

type Failure = 'conflict' | 'failed' | null;

const OUTLINE_BUTTON = 'h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-4 font-sans text-[15px] font-bold text-foreground disabled:opacity-60';
const RED_BUTTON = 'h-11 cursor-pointer rounded-sm border-0 bg-accent px-4 font-sans text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60';

function Facts({ product }: { product: AdminProduct }) {
  const origin = product.origin ? [product.origin.name, product.origin.department].filter(Boolean).join(' · ') : '—';
  const facts: [string, string][] = [
    ['Tipo', product.product_type.name],
    ['Categoría', product.categories.map((category) => category.name).join(', ') || '—'],
    ['Origen', origin],
    ['Marca', product.brand?.name ?? '—'],
  ];
  const image = [...product.images].sort((a, b) => a.position - b.position)[0];
  return (
    <div className="flex items-center gap-4">
      <span className="relative size-[88px] flex-none overflow-hidden rounded-md bg-secondary">
        {image && <img src={image.url} alt="" className="absolute left-1/2 top-1 h-[104px] -translate-x-1/2" />}
      </span>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-sm leading-[1.2]">
        {facts.map(([term, value]) => (
          <React.Fragment key={term}>
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="m-0 font-bold">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

function Variants({ product }: { product: AdminProduct }) {
  const variants = activeVariants(product.variants);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold">Variantes · {variants.length}</span>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary text-left">
              <th className="h-9 px-2.5 font-bold">Presentación</th>
              <th className="px-2.5 text-right font-bold">Precio</th>
              <th className="px-2.5 text-right font-bold">Stock</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.id} className="h-10 border-t border-border">
                <td className="px-2.5">{variantPresentation(variant, product.product_type.attribute_definitions)}</td>
                <td className="px-2.5 text-right font-bold">{formatMoneyCop(variant.price_amount)}</td>
                <td className={`px-2.5 text-right font-bold ${variant.available_quantity === 0 ? 'text-destructive' : ''}`}>{variant.available_quantity === 0 ? 'Agotado' : variant.available_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchiveDialog({ title, busy, onClose, onConfirm }: { title: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-foreground/50" />
        <AlertDialog.Content className="fixed left-1/2 top-[20vh] z-[60] flex w-[calc(100%-32px)] max-w-[500px] -translate-x-1/2 flex-col gap-3 rounded-xl border border-border bg-card p-6 leading-[normal]">
          <span className="inline-flex size-12 items-center justify-center rounded-[50%] bg-secondary">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="text-destructive"><path d="M3 7h18M5 7v12h14V7M9 11h6M9 3h6" /></svg>
          </span>
          <AlertDialog.Title className="m-0 text-[20px] font-extrabold">¿Archivar {title}?</AlertDialog.Title>
          <AlertDialog.Description className="m-0 text-[15px] leading-[1.5] text-muted-foreground">Deja de verse en la tienda y nadie podrá comprarlo. Los pedidos que ya lo incluyen no cambian. Puedes volver a publicarlo cuando quieras.</AlertDialog.Description>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {/* A-Sistema's outlined control is 44 px of content plus its border. */}
            <AlertDialog.Cancel asChild><button type="button" className="box-content h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-3.5 font-sans text-[15px] font-bold text-foreground">Cancelar</button></AlertDialog.Cancel>
            <button type="button" disabled={busy} onClick={onConfirm} className="h-11 cursor-pointer rounded-sm border-0 bg-accent px-3.5 font-sans text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">Archivar producto</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** Productos "Vista rápida" (A-Productos): facts, publication status and active variants. */
export function ProductSheet({ productId, fallbackTitle, onClose, onSaved }: ProductSheetProps) {
  const [load, setLoad] = React.useState<Load>({ status: 'loading' });
  const [status, setStatus] = React.useState<AdminProductStatus>('published');
  const [failure, setFailure] = React.useState<Failure>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    void getAdminProduct(productId).then((result) => {
      if (!live) return;
      if (!result.ok || result.etag === null) {
        setLoad({ status: 'error' });
        return;
      }
      setLoad({ status: 'ready', product: result.data, etag: result.etag });
      setStatus(result.data.status);
      setFailure(null);
    });
    return () => { live = false; };
  }, [productId, attempt]);

  const ready = load.status === 'ready' ? load : null;
  const changed = ready !== null && status !== ready.product.status;
  // Leaving through "Editar el producto completo", the menu or back asks like closing the Sheet.
  useUnsavedChangesGuard(changed, ready?.product.title ?? fallbackTitle);

  const requestClose = () => {
    if (changed) setConfirmDiscard(true);
    else onClose();
  };

  const save = async () => {
    if (!ready || !changed || saving) return;
    setConfirmArchive(false);
    setSaving(true);
    const result = await updateAdminProduct(ready.product.id, ready.etag, { status });
    setSaving(false);
    if (result.ok) {
      onSaved(result.data);
      onClose();
      return;
    }
    setFailure(isVersionConflict(result) ? 'conflict' : 'failed');
  };

  const onGuardar = () => {
    if (status === 'archived') setConfirmArchive(true);
    else void save();
  };

  const help = publicationHelp(status);
  const body = (() => {
    if (load.status === 'loading') {
      return <div aria-busy="true" aria-label="Cargando producto" className="flex flex-col gap-3 motion-safe:animate-pulse"><span className="h-[88px] rounded-md bg-secondary" /><span className="h-11 rounded-sm bg-secondary" /><span className="h-32 rounded-md bg-secondary" /></div>;
    }
    if (load.status === 'error') {
      return (
        <div role="alert" className="flex flex-col items-start gap-2.5">
          <p className="m-0 text-[15px] font-bold">No pudimos cargar el producto.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className={OUTLINE_BUTTON}>Reintentar</button>
        </div>
      );
    }
    return (
      <>
        <Facts product={load.product} />
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Estado de publicación</span>
          <span className="relative block">
            <select value={status} onChange={(event) => { setStatus(event.target.value as AdminProductStatus); setFailure(null); }} className="h-11 w-full appearance-none rounded-sm border border-muted-foreground bg-card py-0 pl-3 pr-9 font-sans text-[15px] text-foreground">
              {PRODUCT_STATUSES.map((value) => <option key={value} value={value}>{productStatusPresentation(value).label}</option>)}
            </select>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5"><path d="M6 9l6 6 6-6" /></svg>
          </span>
          </label>
          {help && <span className="text-[13px] leading-[1.2] text-muted-foreground">{help}</span>}
        </div>
        <Variants product={load.product} />
        {failure === 'conflict' && (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-md border-2 border-foreground bg-card p-3.5 text-sm">
            <span className="font-extrabold">Alguien más cambió este producto. Recarga para ver la versión actual.</span>
            <span className="text-muted-foreground">Tus cambios no se guardaron. Anótalos antes de recargar.</span>
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="h-11 cursor-pointer rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Recargar</button>
          </div>
        )}
        {failure === 'failed' && <span role="alert" className="text-sm font-bold text-destructive">No pudimos guardar el cambio. Intenta de nuevo.</span>}
        <a href={productDetailHref(load.product.id)} className="inline-flex min-h-11 items-center self-start text-[15px] font-bold underline-offset-4">Editar el producto completo →</a>
      </>
    );
  })();

  return (
    <>
      <AdminSheet
        kicker="Vista rápida"
        title={ready?.product.title ?? fallbackTitle}
        onClose={requestClose}
        bodyGap="gap-[18px]"
        footer={
          <>
            <button type="button" onClick={requestClose} className={OUTLINE_BUTTON}>Cancelar</button>
            <button type="button" disabled={!changed || saving} onClick={onGuardar} className={RED_BUTTON}>Guardar</button>
          </>
        }
      >
        {body}
      </AdminSheet>
      {confirmDiscard && ready && <DiscardChangesDialog title={ready.product.title} onContinue={() => setConfirmDiscard(false)} onDiscard={onClose} />}
      {confirmArchive && ready && <ArchiveDialog title={ready.product.title} busy={saving} onClose={() => setConfirmArchive(false)} onConfirm={() => void save()} />}
    </>
  );
}
