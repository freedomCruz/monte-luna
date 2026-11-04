import * as React from 'react';
import { DropdownMenu } from 'radix-ui';
import { headerOrderBadge, orderActions } from '../../../../lib/admin/order-detail';
import { formatOrderDateTime, formatOrderDateTimeWithYear } from '../../../../lib/admin/order-format';
import { paymentMethodLabel, paymentStatusPresentation } from '../../../../lib/admin/order-status';
import { ADMIN_ROUTES } from '../../../../lib/admin/navigation';
import {
  cancelAdminOrder,
  deliverAdminOrder,
  dispatchAdminOrder,
  getAdminOrder,
  isVersionConflict,
  prepareAdminOrder,
  type AdminOrder,
  type DispatchAdminOrder,
} from '../../../../lib/admin/orders';
import type { AdminResult } from '../../../../lib/admin/client';
import { useIsMobile } from '../../../../lib/admin/use-is-mobile';
import { StatusBadge } from '../../../ui/status-badge';
import { useAdminSession, useMobileDetailHeader } from '../../shell/AdminShell';
import {
  CustomerCard,
  DeliveryCard,
  DeliveryCompact,
  OrderLinesCard,
  OrderLinesCompact,
  OrderPaymentsCard,
  OrderTimelineCard,
  ShipmentCard,
} from './OrderCards';
import { CancelDialog, DeliverDialog, DispatchSheet } from './OrderDialogs';

type Load =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; order: AdminOrder; etag: string };

type Dialog = 'dispatch' | 'cancel' | 'deliver' | null;

const CONFLICT = 'Alguien más cambió este pedido. Recarga para ver la versión actual.';
const INVALID = 'El pedido ya no permite esta acción.';
const FAILED = 'No pudimos completar la acción. Inténtalo de nuevo.';
const STALE = 'El despacho quedó registrado, pero el pedido aún no se actualiza. Recarga en unos segundos.';

const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

const OUTLINE = 'h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-3.5 font-sans text-[15px] font-bold text-foreground disabled:opacity-60';
const RED = 'h-11 cursor-pointer rounded-sm border-0 bg-accent px-4 font-sans text-[15px] font-bold text-white disabled:opacity-60';

function StateScreen({ title, text, action }: { title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-16">
      <div role={action ? 'alert' : undefined} className="flex w-full max-w-[520px] flex-col items-center gap-3 rounded-xl border border-border bg-card px-8 py-10 text-center">
        <h1 className="m-0 text-[24px] font-extrabold">{title}</h1>
        <p className="m-0 text-[15px] text-muted-foreground">{text}</p>
        <a href={ADMIN_ROUTES.orders} className="inline-flex h-11 items-center rounded-sm bg-primary px-4 font-bold text-primary-foreground no-underline">Volver a pedidos</a>
        {action && <button type="button" onClick={action.onClick} className={OUTLINE}>{action.label}</button>}
      </div>
    </main>
  );
}

interface OrderDetailViewProps {
  /** Order id read from the address bar; null when the link carries none. */
  id: string | null;
  /** Wait between reloads after a dispatch while the order projection catches up. */
  pollIntervalMs?: number;
  pollAttempts?: number;
}

/** Pedido (A-Pedido): order detail with status-dependent actions. */
export function OrderDetailView({ id, pollIntervalMs = 1000, pollAttempts = 10 }: OrderDetailViewProps) {
  const { user } = useAdminSession();
  const mobile = useIsMobile();
  const [load, setLoad] = React.useState<Load>({ status: id ? 'loading' : 'not-found' });
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: 'conflict' | 'stale'; text: string } | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const now = React.useMemo(() => new Date(), [load]);

  const order = load.status === 'ready' ? load.order : null;
  useMobileDetailHeader(mobile && order ? { title: order.order_number, backHref: ADMIN_ROUTES.orders, backLabel: 'Volver a pedidos' } : null);

  const read = React.useCallback(async (): Promise<AdminResult<AdminOrder>> => {
    const result = await getAdminOrder(id as string);
    if (result.ok && result.etag) setLoad({ status: 'ready', order: result.data, etag: result.etag });
    return result;
  }, [id]);

  React.useEffect(() => {
    if (!id) return;
    let live = true;
    setLoad({ status: 'loading' });
    void getAdminOrder(id).then((result) => {
      if (!live) return;
      if (result.ok && result.etag) setLoad({ status: 'ready', order: result.data, etag: result.etag });
      else setLoad({ status: !result.ok && result.status === 404 ? 'not-found' : 'error' });
    });
    return () => { live = false; };
  }, [id, attempt]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (load.status === 'loading') return <main className="flex flex-1 items-center justify-center"><p role="status" className="font-bold text-muted-foreground">Cargando el pedido…</p></main>;
  if (load.status === 'not-found') return <StateScreen title="No encontramos este pedido" text="Puede que el enlace esté incompleto o que el pedido ya no exista." />;
  if (load.status === 'error') return <StateScreen title="No pudimos cargar el pedido" text="Puede ser la conexión. Tus pedidos están a salvo." action={{ label: 'Reintentar', onClick: () => setAttempt((value) => value + 1) }} />;

  const current = load.order;
  const etag = load.etag;
  const actions = orderActions(current.status);

  // A rejected write explains itself and reloads, so the next action uses the real version.
  const handleFailure = async (result: Extract<AdminResult<unknown>, { ok: false }>) => {
    setDialog(null);
    setNotice({ kind: 'conflict', text: isVersionConflict(result) ? CONFLICT : result.status === 409 ? INVALID : FAILED });
    await read();
  };

  const write = async (call: () => Promise<AdminResult<AdminOrder>>) => {
    setBusy(true);
    setNotice(null);
    const result = await call();
    setBusy(false);
    if (result.ok) {
      setDialog(null);
      setLoad({ status: 'ready', order: result.data, etag: result.etag ?? etag });
      return;
    }
    await handleFailure(result);
  };

  // 200 only confirms the shipment and its event: reload until the order shows Enviado.
  const dispatch = async (body: DispatchAdminOrder): Promise<string | null> => {
    setBusy(true);
    setNotice(null);
    const result = await dispatchAdminOrder(current.id, etag, body);
    if (!result.ok) {
      setBusy(false);
      if (result.status === 422) return 'Revisa los datos del despacho e inténtalo de nuevo.';
      await handleFailure(result);
      return null;
    }
    setDialog(null);
    setToast(`Despacho registrado. Le avisamos a ${current.customer.full_name.trim().split(/\s+/)[0]} por correo.`);
    for (let i = 0; i < pollAttempts; i += 1) {
      await sleep(pollIntervalMs);
      const next = await read();
      if (next.ok && next.data.status === 'shipped') {
        setBusy(false);
        return null;
      }
    }
    setBusy(false);
    setNotice({ kind: 'stale', text: STALE });
    return null;
  };

  const primary = actions.deliver
    ? { label: 'Marcar como entregado', onClick: () => setDialog('deliver') }
    : actions.dispatch
      ? { label: 'Registrar despacho', onClick: () => setDialog('dispatch') }
      : null;

  const payment = current.payment;
  const orderBadge = headerOrderBadge(current.status);
  const paymentBadge = payment ? paymentStatusPresentation(payment.status) : null;
  const paymentText = payment && paymentBadge ? `Pago ${paymentBadge.label.toLowerCase()}` : null;

  const banner = notice && (notice.kind === 'conflict'
    ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive bg-card px-4 py-3 text-[15px] font-bold text-destructive"><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} className={OUTLINE}>Entendido</button></div>
    : <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-secondary px-4 py-3 text-[15px] font-bold"><span>{notice.text}</span><button type="button" onClick={() => { setNotice(null); void read(); }} className={OUTLINE}>Recargar</button></div>);

  const toastView = toast && (
    <div role="status" className="fixed bottom-24 left-4 right-4 z-[60] flex items-center gap-3 rounded-md bg-foreground px-4 py-3.5 text-background shadow-[0_10px_28px_rgba(27,21,16,0.16)] min-[391px]:left-auto min-[391px]:bottom-6">
      <span className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-success"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
      <span className="text-[15px] font-bold">{toast}</span>
    </div>
  );

  const dialogs = (
    <>
      {dialog === 'dispatch' && <DispatchSheet order={current} busy={busy} onSubmit={dispatch} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && <CancelDialog order={current} owner={user.role === 'owner'} busy={busy} onClose={() => setDialog(null)} onConfirm={(reason) => void write(() => cancelAdminOrder(current.id, etag, reason ? { reason } : {}))} />}
      {dialog === 'deliver' && <DeliverDialog order={current} busy={busy} onClose={() => setDialog(null)} onConfirm={() => void write(() => deliverAdminOrder(current.id, etag))} />}
      {toastView}
    </>
  );

  if (mobile) {
    return (
      <>
        <main className="flex flex-1 flex-col gap-3 px-4 pb-28 pt-4">
          {banner}
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={orderBadge.tone} className="h-[26px]">{orderBadge.label}</StatusBadge>
            {payment && paymentBadge && <StatusBadge tone={paymentBadge.tone} className="h-[26px]">{paymentText} · {paymentMethodLabel(payment.payment_method_type)}</StatusBadge>}
          </div>
          <span className="text-[13px] text-muted-foreground">{formatOrderDateTime(current.placed_at)}</span>
          <OrderLinesCompact order={current} />
          <DeliveryCompact order={current} />
          {current.shipment && current.shipment.status !== 'pending' && <ShipmentCard order={current} now={now} compact />}
          <OrderTimelineCard order={current} compact />
          <div className="flex items-start gap-2.5 rounded-md bg-secondary p-3 text-[13px] leading-[1.45]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            <span>Cancelar el pedido o ver los intentos de pago se hace desde un computador o una tablet.</span>
          </div>
        </main>
        {primary && (
          <div className="sticky bottom-0 z-40 border-t-2 border-foreground bg-card px-4 pb-3.5 pt-2.5">
            <button type="button" disabled={busy} onClick={primary.onClick} className={`${RED} h-[52px] w-full text-base`}>{primary.label}</button>
          </div>
        )}
        {dialogs}
      </>
    );
  }

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-12 pt-[22px] min-[1024px]:px-6 min-[1440px]:px-8">
        {banner}
        <nav aria-label="Ruta" className="flex items-center gap-2 text-sm font-semibold">
          <a href={ADMIN_ROUTES.orders} className="inline-flex min-h-8 items-center">Pedidos</a>
          <span aria-hidden="true">/</span>
          <span className="text-muted-foreground">{current.order_number}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 font-condensed text-[36px] font-extrabold leading-none tracking-[0.02em]">{current.order_number}</h1>
              <StatusBadge tone={orderBadge.tone} className="h-7">{orderBadge.label}</StatusBadge>
              {payment && paymentBadge && <StatusBadge tone={paymentBadge.tone} className="h-7">{paymentText}</StatusBadge>}
            </span>
            <span className="text-sm text-muted-foreground">{formatOrderDateTimeWithYear(current.placed_at)} · {current.customer.full_name}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.prepare && <button type="button" disabled={busy} onClick={() => void write(() => prepareAdminOrder(current.id, etag))} className={OUTLINE}>Pasar a «En preparación»</button>}
            {primary && <button type="button" disabled={busy} onClick={primary.onClick} className={RED}>{primary.label}</button>}
            {actions.cancel && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" disabled={busy} aria-label="Más acciones: cancelar pedido" className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border border-muted-foreground bg-card text-foreground disabled:opacity-60"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg></button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-56 rounded-md border border-border bg-popover p-1.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
                    <DropdownMenu.Item onSelect={() => setDialog('cancel')} className="flex min-h-10 cursor-pointer items-center rounded-sm px-2.5 text-[15px] font-bold text-destructive outline-none data-[highlighted]:bg-secondary">Cancelar pedido</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
            <OrderLinesCard order={current} />
            <OrderPaymentsCard order={current} />
            <OrderTimelineCard order={current} />
          </div>
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <CustomerCard order={current} />
            <DeliveryCard order={current} />
            <ShipmentCard order={current} now={now} />
          </div>
        </div>
      </main>
      {dialogs}
    </>
  );
}
