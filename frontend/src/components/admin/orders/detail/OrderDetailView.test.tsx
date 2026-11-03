import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPaidOrder } from '../../../../mocks/admin-orders';
import type { AdminOrder } from '../../../../lib/admin/orders';
import { OrderDetailView } from './OrderDetailView';

const mocks = vi.hoisted(() => ({
  getAdminOrder: vi.fn(),
  prepareAdminOrder: vi.fn(),
  deliverAdminOrder: vi.fn(),
  cancelAdminOrder: vi.fn(),
  dispatchAdminOrder: vi.fn(),
  role: { current: 'owner' as 'owner' | 'staff' },
}));

vi.mock('../../../../lib/admin/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin/orders')>()),
  getAdminOrder: mocks.getAdminOrder,
  prepareAdminOrder: mocks.prepareAdminOrder,
  deliverAdminOrder: mocks.deliverAdminOrder,
  cancelAdminOrder: mocks.cancelAdminOrder,
  dispatchAdminOrder: mocks.dispatchAdminOrder,
}));

vi.mock('../../shell/AdminShell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shell/AdminShell')>()),
  useAdminSession: () => ({ user: { role: mocks.role.current }, etag: null }),
}));

const ID = mockPaidOrder.id;
const ok = (order: AdminOrder) => ({ ok: true as const, data: order, etag: `"${order.version}"` });
const fail = (status: number, code: string) => ({ ok: false as const, status, code });

const shipped: AdminOrder = {
  ...mockPaidOrder,
  status: 'shipped',
  version: 4,
  shipment: { ...mockPaidOrder.shipment!, status: 'shipped', carrier_name: 'Coordinadora', tracking_number: '54872013369', tracking_url: 'https://t.test/54872013369', shipped_at: '2026-10-21T14:00:00Z', version: 2 },
};
const preparing: AdminOrder = { ...mockPaidOrder, status: 'preparing', version: 3 };
const originalWidth = window.innerWidth;

beforeEach(() => {
  mocks.role.current = 'owner';
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  mocks.getAdminOrder.mockResolvedValue(ok(mockPaidOrder));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
});

const renderView = (props: { pollIntervalMs?: number; pollAttempts?: number } = {}) =>
  render(<OrderDetailView id={ID} pollIntervalMs={0} pollAttempts={3} {...props} />);

describe('OrderDetailView content (F3: S4)', () => {
  it('shows the header, lines, summary, payments, timeline and side cards', async () => {
    renderView();
    expect(await screen.findByRole('heading', { name: 'ORD-7K2M9Q4X', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pedidos' }).getAttribute('href')).toBe('/admin/pedidos/');
    expect(screen.getByText('Pagado · por despachar')).toBeTruthy();
    expect(screen.getByText('Pago aprobado')).toBeTruthy();
    expect(screen.getByText(/20 oct 2026, 9:12 a\. m\. · María Fernanda Ruiz/)).toBeTruthy();

    const lines = screen.getByRole('region', { name: /Productos/ });
    expect(within(lines).getByRole('heading', { name: 'Productos · 3 unidades' })).toBeTruthy();
    expect(within(lines).getByText('Finca El Mirador')).toBeTruthy();
    expect(within(lines).getByText('250 g / Grano entero · MTL-MIR-250-GR')).toBeTruthy();
    expect(within(lines).getByText('L-2026-041')).toBeTruthy();
    expect(within(lines).getByText('· tostado 12 oct')).toBeTruthy();
    expect(within(lines).getByText('Subtotal')).toBeTruthy();
    expect(within(lines).getByText('Envío')).toBeTruthy();
    expect(within(lines).getByText('Impuestos')).toBeTruthy();
    expect(within(lines).getByText('$112.100')).toBeTruthy();
    expect(within(lines).queryByText(/Descuento/)).toBeNull();

    const payments = screen.getByRole('region', { name: /Intentos de pago/ });
    expect(within(payments).getByText('REF-ORD-7K2M9Q4X-2')).toBeTruthy();
    expect(within(payments).getByText('128734-1729-41907')).toBeTruthy();
    expect(within(payments).getByText('Rechazado')).toBeTruthy();

    const timeline = screen.getByRole('region', { name: 'Línea de tiempo' });
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(5);

    expect(screen.getByRole('region', { name: 'Cliente' }).textContent).toContain('310 555 0142');
    const delivery = screen.getByRole('region', { name: 'Entrega' });
    expect(delivery.textContent).toContain('Calle 10 # 43-12, Apto 502');
    expect(delivery.textContent).toContain('Medellín, Antioquia · 05001');
    expect(delivery.textContent).toContain('Recibe María Fernanda Ruiz · 310 555 0142');
    expect(delivery.textContent).toContain('Nota: Dejar con portería');
    expect(screen.getByRole('region', { name: 'Envío' }).textContent).toContain('Aún no se despacha');
    expect(screen.queryByRole('heading', { name: 'Factura' })).toBeNull();
  });

  it('shows the coupon discount and the zone and band when they exist', async () => {
    mocks.getAdminOrder.mockResolvedValue(ok({
      ...mockPaidOrder,
      summary: { ...mockPaidOrder.summary, discount_amount: 1140000, coupon_code: 'BIENVENIDA10', shipping: { ...mockPaidOrder.summary.shipping, zone_name: 'Antioquia', min_weight_grams: 0, max_weight_grams: 1000 } },
    }));
    renderView();
    expect(await screen.findByText('Descuento · cupón BIENVENIDA10')).toBeTruthy();
    expect(screen.getByText('−$11.400')).toBeTruthy();
    expect(screen.getByText('Envío · Antioquia, 0 a 1.000 g')).toBeTruthy();
  });

  it('shows the carrier and tracking of a shipped order', async () => {
    mocks.getAdminOrder.mockResolvedValue(ok(shipped));
    renderView();
    const card = await screen.findByRole('region', { name: 'Envío' });
    expect(card.textContent).toContain('Coordinadora');
    expect(card.textContent).toContain('54872013369');
    expect(within(card).getByRole('link', { name: 'Ver seguimiento' }).getAttribute('href')).toBe('https://t.test/54872013369');
  });

  it('shows not found and error states', async () => {
    mocks.getAdminOrder.mockResolvedValueOnce(fail(404, 'order_not_found'));
    const { unmount } = renderView();
    expect(await screen.findByRole('heading', { name: 'No encontramos este pedido' })).toBeTruthy();
    unmount();

    mocks.getAdminOrder.mockResolvedValueOnce(fail(500, 'internal_error'));
    renderView();
    expect(await screen.findByRole('heading', { name: 'No pudimos cargar el pedido' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'ORD-7K2M9Q4X', level: 1 })).toBeTruthy();
  });

  it('shows not found without a request when the address carries no id', async () => {
    render(<OrderDetailView id={null} />);
    expect(await screen.findByRole('heading', { name: 'No encontramos este pedido' })).toBeTruthy();
    expect(mocks.getAdminOrder).not.toHaveBeenCalled();
  });
});

describe('OrderDetailView actions by status (F3: S4)', () => {
  const buttons = () => screen.queryAllByRole('button').map((button) => button.textContent || button.getAttribute('aria-label'));

  it('paid: prepare, dispatch and the more-actions menu', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'ORD-7K2M9Q4X', level: 1 });
    expect(screen.getByRole('button', { name: 'Pasar a «En preparación»' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar despacho' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Más acciones: cancelar pedido' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Marcar como entregado' })).toBeNull();
  });

  it('preparing: dispatch and cancel only', async () => {
    mocks.getAdminOrder.mockResolvedValue(ok(preparing));
    renderView();
    await screen.findByRole('heading', { name: 'ORD-7K2M9Q4X', level: 1 });
    expect(screen.queryByRole('button', { name: 'Pasar a «En preparación»' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Registrar despacho' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Más acciones: cancelar pedido' })).toBeTruthy();
  });

  it('shipped: Marcar como entregado is the primary action', async () => {
    mocks.getAdminOrder.mockResolvedValue(ok(shipped));
    renderView();
    await screen.findByRole('heading', { name: 'ORD-7K2M9Q4X', level: 1 });
    expect(screen.getByRole('button', { name: 'Marcar como entregado' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Registrar despacho' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Más acciones: cancelar pedido' })).toBeNull();
  });

  it.each(['delivered', 'cancelled', 'expired', 'pending_payment'] as const)('%s: no actions', async (status) => {
    mocks.getAdminOrder.mockResolvedValue(ok({ ...mockPaidOrder, status }));
    renderView();
    await screen.findByRole('heading', { name: 'ORD-7K2M9Q4X', level: 1 });
    expect(buttons().filter((label) => /Pasar|despacho|entregado|Más acciones/.test(label ?? ''))).toEqual([]);
  });
});

describe('OrderDetailView writes (F3: S4, S5)', () => {
  it('moves a paid order to preparing with the order ETag and shows the response', async () => {
    mocks.prepareAdminOrder.mockResolvedValue(ok(preparing));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Pasar a «En preparación»' }));
    await waitFor(() => expect(mocks.prepareAdminOrder).toHaveBeenCalledWith(ID, '"2"'));
    await waitFor(() => expect(screen.queryByText('Pagado · por despachar')).toBeNull());
    expect(screen.getAllByText('En preparación').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Pasar a «En preparación»' })).toBeNull();
  });

  it('on a version conflict shows the message and reloads the order', async () => {
    mocks.prepareAdminOrder.mockResolvedValue(fail(412, 'version_conflict'));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Pasar a «En preparación»' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Alguien más cambió este pedido. Recarga para ver la versión actual.');
    await waitFor(() => expect(mocks.getAdminOrder).toHaveBeenCalledTimes(2));
  });

  it('on an invalid transition tells the person and reloads', async () => {
    mocks.prepareAdminOrder.mockResolvedValue(fail(409, 'invalid_order_transition'));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Pasar a «En preparación»' }));
    expect((await screen.findByRole('alert')).textContent).toContain('El pedido ya no permite esta acción.');
    await waitFor(() => expect(mocks.getAdminOrder).toHaveBeenCalledTimes(2));
  });

  it('cancels from the menu with an optional reason', async () => {
    mocks.cancelAdminOrder.mockResolvedValue(ok({ ...mockPaidOrder, status: 'cancelled', version: 3 }));
    renderView();
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Más acciones: cancelar pedido' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar pedido' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: '¿Cancelar el pedido ORD-7K2M9Q4X?' })).toBeTruthy();
    expect(dialog.textContent).toContain('El pago ya está aprobado: se crea un reembolso de $112.100 que debes completar en Pagos.');
    expect(dialog.textContent).toContain('Las 3 unidades vuelven al inventario y la cliente recibe un correo. No se puede deshacer.');
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: '  Cliente lo pidió  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
    await waitFor(() => expect(mocks.cancelAdminOrder).toHaveBeenCalledWith(ID, '"2"', { reason: 'Cliente lo pidió' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Más acciones: cancelar pedido' })).toBeNull();
  });

  it('sends no reason when the field is blank and offers Volver', async () => {
    mocks.cancelAdminOrder.mockResolvedValue(ok({ ...mockPaidOrder, status: 'cancelled', version: 3 }));
    renderView();
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Más acciones: cancelar pedido' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar pedido' }));
    let dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.cancelAdminOrder).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Más acciones: cancelar pedido' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar pedido' }));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
    await waitFor(() => expect(mocks.cancelAdminOrder).toHaveBeenCalledWith(ID, '"2"', {}));
  });

  it('does not promise staff a refund screen they cannot use', async () => {
    mocks.role.current = 'staff';
    renderView();
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Más acciones: cancelar pedido' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar pedido' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).not.toContain('Pagos');
    expect(dialog.textContent).toContain('Se crea un reembolso que completa la persona propietaria.');
  });

  it('confirms before marking a shipped order as delivered', async () => {
    mocks.getAdminOrder.mockResolvedValue(ok(shipped));
    mocks.deliverAdminOrder.mockResolvedValue(ok({ ...shipped, status: 'delivered', version: 5 }));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como entregado' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: '¿Marcar ORD-7K2M9Q4X como entregado?' })).toBeTruthy();
    expect(mocks.deliverAdminOrder).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar como entregado' }));
    await waitFor(() => expect(mocks.deliverAdminOrder).toHaveBeenCalledWith(ID, '"4"'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Marcar como entregado' })).toBeNull());
  });
});

describe('Registrar despacho sheet (F3: S5)', () => {
  async function openSheet() {
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar despacho' }));
    return screen.findByRole('dialog', { name: 'Registrar despacho' });
  }

  it('asks for the carrier, tracking number and link, and names the customer in the note', async () => {
    renderView();
    const sheet = await openSheet();
    expect(within(sheet).getByText('ORD-7K2M9Q4X · Medellín, Antioquia')).toBeTruthy();
    expect(within(sheet).getByLabelText('Transportadora')).toBeTruthy();
    expect(within(sheet).getByLabelText(/Número de guía/)).toBeTruthy();
    expect((within(sheet).getByLabelText(/Enlace de seguimiento/) as HTMLInputElement).placeholder).toBe('https://');
    expect(sheet.textContent).toContain('Al registrar, el pedido pasa a Enviado y María recibe un correo con la transportadora y la guía.');
    expect(within(sheet).getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  });

  it('requires a carrier and an https link before sending', async () => {
    renderView();
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Registrar despacho' }));
    expect(within(sheet).getByText('Escribe la transportadora.')).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText('Transportadora'), { target: { value: 'Coordinadora' } });
    fireEvent.change(within(sheet).getByLabelText(/Enlace de seguimiento/), { target: { value: 'http://insecure.test' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Registrar despacho' }));
    expect(within(sheet).getByText('El enlace debe empezar por https://.')).toBeTruthy();
    expect(mocks.dispatchAdminOrder).not.toHaveBeenCalled();
  });

  it('dispatches with both versions, confirms with a toast, and reloads until the order is shipped', async () => {
    mocks.dispatchAdminOrder.mockResolvedValue({ ok: true, data: shipped.shipment, etag: '"2"' });
    mocks.getAdminOrder
      .mockResolvedValueOnce(ok(mockPaidOrder))
      .mockResolvedValueOnce(ok(mockPaidOrder))
      .mockResolvedValue(ok(shipped));
    renderView();
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText('Transportadora'), { target: { value: ' Coordinadora ' } });
    fireEvent.change(within(sheet).getByLabelText(/Número de guía/), { target: { value: '54872013369' } });
    fireEvent.change(within(sheet).getByLabelText(/Enlace de seguimiento/), { target: { value: 'https://t.test/54872013369' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Registrar despacho' }));

    await waitFor(() => expect(mocks.dispatchAdminOrder).toHaveBeenCalledWith(ID, '"2"', {
      carrier_name: 'Coordinadora',
      shipment_version: 1,
      tracking_number: '54872013369',
      tracking_url: 'https://t.test/54872013369',
    }));
    expect((await screen.findByText('Despacho registrado. Le avisamos a María por correo.'))).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Marcar como entregado' })).toBeTruthy();
    expect(mocks.getAdminOrder).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('dialog', { name: 'Registrar despacho' })).toBeNull();
  });

  it('omits blank optional fields and sends a null shipment version when the order has no shipment', async () => {
    mocks.getAdminOrder.mockResolvedValue(ok({ ...mockPaidOrder, shipment: null }));
    mocks.dispatchAdminOrder.mockResolvedValue({ ok: true, data: shipped.shipment, etag: '"1"' });
    renderView();
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText('Transportadora'), { target: { value: 'Servientrega' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Registrar despacho' }));
    await waitFor(() => expect(mocks.dispatchAdminOrder).toHaveBeenCalledWith(ID, '"2"', { carrier_name: 'Servientrega', shipment_version: null }));
  });

  it('says so when the order does not reach Enviado after the registration', async () => {
    mocks.dispatchAdminOrder.mockResolvedValue({ ok: true, data: shipped.shipment, etag: '"2"' });
    renderView({ pollAttempts: 2 });
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText('Transportadora'), { target: { value: 'Coordinadora' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Registrar despacho' }));
    expect((await screen.findByText(/El despacho quedó registrado, pero el pedido aún no se actualiza/)).textContent).toBeTruthy();
    mocks.getAdminOrder.mockResolvedValue(ok(shipped));
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(await screen.findByRole('button', { name: 'Marcar como entregado' })).toBeTruthy();
  });

  it('on a version conflict closes the sheet, explains and reloads', async () => {
    mocks.dispatchAdminOrder.mockResolvedValue(fail(412, 'version_conflict'));
    renderView();
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText('Transportadora'), { target: { value: 'Coordinadora' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Registrar despacho' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Alguien más cambió este pedido. Recarga para ver la versión actual.');
    await waitFor(() => expect(mocks.getAdminOrder).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog', { name: 'Registrar despacho' })).toBeNull();
  });

  it('keeps the sheet open with a message when the API rejects the fields', async () => {
    mocks.dispatchAdminOrder.mockResolvedValue(fail(422, 'validation_failed'));
    renderView();
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText('Transportadora'), { target: { value: 'Coordinadora' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Registrar despacho' }));
    expect(await within(sheet).findByText('Revisa los datos del despacho e inténtalo de nuevo.')).toBeTruthy();
  });
});

describe('OrderDetailView at 390 px (F3: S4, S8)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  });

  it('shows cards, the desktop-only note and the sticky Registrar despacho bar', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'Productos · 3 unidades' });
    expect(screen.queryByRole('region', { name: /Intentos de pago/ })).toBeNull();
    expect(screen.getByText('Cancelar el pedido o ver los intentos de pago se hace desde un computador o una tablet.')).toBeTruthy();
    expect(screen.getByText('Pagado · por despachar')).toBeTruthy();
    expect(screen.getByText('Pago aprobado · Nequi')).toBeTruthy();
    expect(screen.getByText(/lotes L-2026-041 ×2/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pasar a «En preparación»' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Más acciones: cancelar pedido' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Registrar despacho' })).toHaveLength(1);
  });

  it('puts Marcar como entregado in the sticky bar for a shipped order', async () => {
    mocks.getAdminOrder.mockResolvedValue(ok(shipped));
    renderView();
    expect(await screen.findByRole('button', { name: 'Marcar como entregado' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Marcar como entregado' })).toHaveLength(1);
  });
});
