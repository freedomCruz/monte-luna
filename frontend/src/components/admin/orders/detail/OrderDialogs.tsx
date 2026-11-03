import * as React from 'react';
import { AlertDialog, Dialog } from 'radix-ui';
import { firstName, unitsLabel } from '../../../../lib/admin/order-detail';
import type { AdminOrder, DispatchAdminOrder } from '../../../../lib/admin/orders';
import { formatOrderDestination } from '../../../../lib/admin/order-format';
import { formatMoneyCop } from '../../../../lib/shared/formatters';

const SCRIM = 'fixed inset-0 z-50 bg-foreground/50';
const OUTLINE_BUTTON = 'h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-4 font-sans text-[15px] font-bold text-foreground disabled:opacity-60';
const RED_BUTTON = 'h-11 cursor-pointer rounded-sm border-0 bg-accent px-4 font-sans text-[15px] font-bold text-white disabled:opacity-60';
const FIELD = 'h-11 rounded-sm border border-muted-foreground bg-card px-3 font-sans text-base text-foreground';

const unitsOf = (order: AdminOrder) => order.lines.reduce((sum, line) => sum + line.quantity, 0);

interface CancelDialogProps {
  order: AdminOrder;
  owner: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/** "¿Cancelar el pedido …?" (A-Pedido): names the object and explains the consequence. */
export function CancelDialog({ order, owner, busy, onClose, onConfirm }: CancelDialogProps) {
  const [reason, setReason] = React.useState('');
  const refund = order.payment?.status === 'approved'
    ? owner
      ? `El pago ya está aprobado: se crea un reembolso de ${formatMoneyCop(order.summary.total_amount)} que debes completar en Pagos. `
      : 'El pago ya está aprobado. Se crea un reembolso que completa la persona propietaria. '
    : '';
  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={SCRIM} />
        <AlertDialog.Content className="fixed left-1/2 top-[20vh] z-50 flex w-[calc(100%-32px)] max-w-[500px] -translate-x-1/2 flex-col gap-3 rounded-xl bg-card p-6">
          <AlertDialog.Title className="m-0 text-xl font-extrabold">¿Cancelar el pedido {order.order_number}?</AlertDialog.Title>
          <AlertDialog.Description className="m-0 text-[15px] leading-6 text-muted-foreground">
            {refund}{unitsOf(order) === 1 ? 'La unidad vuelve' : `Las ${unitsLabel(unitsOf(order))} vuelven`} al inventario y la cliente recibe un correo. No se puede deshacer.
          </AlertDialog.Description>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            <span>Motivo <span className="font-medium text-muted-foreground">(opcional)</span></span>
            <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Queda en la línea de tiempo" className={`${FIELD} text-[15px] font-normal`} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild><button type="button" className={OUTLINE_BUTTON}>Volver</button></AlertDialog.Cancel>
            <button type="button" disabled={busy} onClick={() => onConfirm(reason.trim())} className={RED_BUTTON}>Cancelar pedido</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** Confirmation before "Marcar como entregado" (S4: the UI confirms before sending). */
export function DeliverDialog({ order, busy, onClose, onConfirm }: { order: AdminOrder; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={SCRIM} />
        <AlertDialog.Content className="fixed left-1/2 top-[20vh] z-50 flex w-[calc(100%-32px)] max-w-[500px] -translate-x-1/2 flex-col gap-3 rounded-xl bg-card p-6">
          <AlertDialog.Title className="m-0 text-xl font-extrabold">¿Marcar {order.order_number} como entregado?</AlertDialog.Title>
          <AlertDialog.Description className="m-0 text-[15px] leading-6 text-muted-foreground">Confirma que {firstName(order.customer.full_name)} ya recibió el pedido. No se puede deshacer.</AlertDialog.Description>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild><button type="button" className={OUTLINE_BUTTON}>Volver</button></AlertDialog.Cancel>
            <button type="button" disabled={busy} onClick={onConfirm} className={RED_BUTTON}>Marcar como entregado</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

const HTTPS_URL = /^https:\/\/[^/\s?#]+([/?#]\S*)?$/;

interface DispatchSheetProps {
  order: AdminOrder;
  busy: boolean;
  /** Resolves to an error message to keep the sheet open, or null when it should close. */
  onSubmit: (body: DispatchAdminOrder) => Promise<string | null>;
  onClose: () => void;
}

/** "Registrar despacho" sheet: 520 px over the page at ≥ 1024 px, full screen below. */
export function DispatchSheet({ order, busy, onSubmit, onClose }: DispatchSheetProps) {
  const [carrier, setCarrier] = React.useState('');
  const [tracking, setTracking] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [errors, setErrors] = React.useState<{ carrier?: string; url?: string; form?: string }>({});
  const [sending, setSending] = React.useState(false);
  const customer = firstName(order.customer.full_name);

  const submit = async () => {
    const next: typeof errors = {};
    if (carrier.trim() === '') next.carrier = 'Escribe la transportadora.';
    if (url.trim() !== '' && !HTTPS_URL.test(url.trim())) next.url = 'El enlace debe empezar por https://.';
    setErrors(next);
    if (next.carrier || next.url) return;
    const body: DispatchAdminOrder = {
      carrier_name: carrier.trim(),
      shipment_version: order.shipment?.version ?? null,
      ...(tracking.trim() ? { tracking_number: tracking.trim() } : {}),
      ...(url.trim() ? { tracking_url: url.trim() } : {}),
    };
    setSending(true);
    const failure = await onSubmit(body);
    setSending(false);
    if (failure) setErrors({ form: failure });
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={SCRIM} />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card min-[1024px]:w-[520px] min-[1024px]:rounded-l-xl">
          <div className="flex items-start justify-between gap-3 px-6 py-5">
            <div className="flex flex-col gap-1">
              <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{order.order_number} · {formatOrderDestination(order.shipping_address.municipality_name, order.shipping_address.department_name)}</span>
              <Dialog.Title className="m-0 text-2xl font-extrabold">Registrar despacho</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Cerrar" className="inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-secondary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </Dialog.Close>
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5">
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Transportadora</span>
                <input type="text" value={carrier} onChange={(event) => setCarrier(event.target.value)} aria-invalid={Boolean(errors.carrier)} className={FIELD} />
              </label>
              {errors.carrier && <span role="alert" className="text-[13px] font-bold text-destructive">{errors.carrier}</span>}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Número de guía <span className="font-medium text-muted-foreground">(opcional)</span></span>
              <input type="text" value={tracking} onChange={(event) => setTracking(event.target.value)} className={FIELD} />
            </label>
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Enlace de seguimiento <span className="font-medium text-muted-foreground">(opcional)</span></span>
                <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" aria-invalid={Boolean(errors.url)} className={FIELD} />
              </label>
              {errors.url && <span role="alert" className="text-[13px] font-bold text-destructive">{errors.url}</span>}
            </div>
            <div className="flex items-start gap-2.5 rounded-md bg-background px-3.5 py-3 text-sm leading-[1.45]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none"><path d="M3 6h18v12H3zM3 7l9 6 9-6" /></svg>
              <span>Al registrar, el pedido pasa a <span className="font-extrabold">Enviado</span> y {customer} recibe un correo con la transportadora y la guía.</span>
            </div>
            {errors.form && <span role="alert" className="text-sm font-bold text-destructive">{errors.form}</span>}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Dialog.Close asChild><button type="button" className={OUTLINE_BUTTON}>Cancelar</button></Dialog.Close>
            <button type="button" disabled={busy || sending} onClick={() => void submit()} className={RED_BUTTON}>Registrar despacho</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
