import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { CheckoutIsland } from './CheckoutIsland';
import { clearCart, addItem } from '../../lib/cart-store';

describe('CheckoutIsland component (S3, S4, S5, S6)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    sessionStorage.clear();
    clearCart();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  const mockItem = {
    variant_id: '01912345-6789-7abc-def0-123456789abc',
    product_slug: 'finca-el-mirador',
    product_name: 'Finca El Mirador',
    variant_label: '500 g / Grano entero',
    origin_name: 'Huila',
    quantity: 1,
    product_type: 'coffee' as const,
  };

  const mockAvailabilityResponse = {
    items: [
      {
        product_slug: 'finca-el-mirador',
        variants: [
          {
            variant_id: '01912345-6789-7abc-def0-123456789abc',
            sku: 'MTL-MIR-500-GR',
            price_amount: 3800000,
            compare_at_price_amount: 4500000,
            is_available: true,
            available_quantity: 5,
            roast_date: '2 oct 2026',
          },
        ],
      },
    ],
    next_cursor: null,
  };

  const mockQuoteResponse = {
    lines: [
      {
        variant_id: '01912345-6789-7abc-def0-123456789abc',
        product_slug: 'finca-el-mirador',
        product_title: 'Finca El Mirador',
        variant_label: '500 g / Grano entero',
        sku: 'MTL-MIR-500-GR',
        unit_price_amount: 3800000,
        quantity: 1,
        line_total_amount: 3800000,
      },
    ],
    shipping: {
      rate_name: 'Huila estándar',
      shipping_amount: 950000,
      is_free_shipping: false,
      estimated_days_min: 2,
      estimated_days_max: 4,
    },
    subtotal_amount: 3800000,
    shipping_amount: 950000,
    tax_amount: 0,
    total_amount: 4750000,
  };

  it('renders empty cart view when cart has 0 items', () => {
    render(<CheckoutIsland />);
    expect(screen.getByText('Tu carrito está vacío')).toBeDefined();
    expect(screen.getByRole('link', { name: /Explorar la tienda/i })).toBeDefined();
  });

  it('renders Step 2 form when cart has items', async () => {
    addItem(mockItem);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/product-availabilities')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAvailabilityResponse,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    expect(screen.getByText('Paso 2 de 3')).toBeDefined();
    expect(screen.getByText('¿A dónde lo enviamos?')).toBeDefined();
    expect(screen.getByText(/Tus datos de contacto/i)).toBeDefined();
    expect(screen.getByText(/Dirección de entrega/i)).toBeDefined();
    expect(screen.getByLabelText(/Correo electrónico/i)).toBeDefined();
    expect(screen.getByLabelText(/Nombre y apellido completos/i)).toBeDefined();
    expect(screen.getByLabelText(/Departamento/i)).toBeDefined();
    expect(screen.getByLabelText(/Municipio o ciudad/i)).toBeDefined();
    expect(screen.getByLabelText(/Dirección principal/i)).toBeDefined();
    expect(screen.getByText(/CC BY-SA 4.0/i)).toBeDefined();
  });

  it('validates required fields on submit and displays error alerts', async () => {
    addItem(mockItem);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/product-availabilities')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAvailabilityResponse,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    // Click submit without filling fields
    const submitBtn = screen.getAllByRole('button', { name: /Continuar al pago/i })[0];
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
      expect(screen.getByText(/Faltan datos requeridos para continuar/i)).toBeDefined();
      expect(screen.getByText('Escribe tu correo')).toBeDefined();
      expect(screen.getByText('Escribe tu nombre completo')).toBeDefined();
    });
  });

  it('populates municipalities when department is selected and fetches quote', async () => {
    addItem(mockItem);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/product-availabilities')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAvailabilityResponse,
        });
      }
      if (typeof url === 'string' && url.includes('/api/v1/orders/quote')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockQuoteResponse,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    const deptSelect = screen.getByLabelText(/Departamento/i) as HTMLSelectElement;
    // Select Huila (code '41')
    fireEvent.change(deptSelect, { target: { value: '41' } });

    // Municipality select should now have Huila municipalities (like Pitalito '41551')
    const muniSelect = screen.getByLabelText(/Municipio o ciudad/i) as HTMLSelectElement;
    expect(muniSelect.disabled).toBe(false);

    fireEvent.change(muniSelect, { target: { value: '41551' } });

    await waitFor(() => {
      expect(screen.getByText(/Envío a Pitalito, Huila/i)).toBeDefined();
      expect(screen.getByText(/Llega en 2 a 4 días hábiles/i)).toBeDefined();
      expect(screen.getAllByText('$47.500').length).toBeGreaterThan(0);
    });
  });

  it('displays unsupported destination alert when quote returns 422', async () => {
    addItem(mockItem);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/product-availabilities')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAvailabilityResponse,
        });
      }
      if (typeof url === 'string' && url.includes('/api/v1/orders/quote')) {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => ({
            code: 'unsupported_destination',
            detail: 'No shipping rate covers the given destination and weight band',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    const deptSelect = screen.getByLabelText(/Departamento/i);
    // San Andrés code '88'
    fireEvent.change(deptSelect, { target: { value: '88' } });

    const muniSelect = screen.getByLabelText(/Municipio o ciudad/i);
    // Providencia code '88564'
    fireEvent.change(muniSelect, { target: { value: '88564' } });

    await waitFor(() => {
      expect(screen.getByText(/Todavía no llegamos a Providencia/i)).toBeDefined();
    });
  });

  it('transitions to Step 3 (Pago seguro) on valid form submission', async () => {
    addItem(mockItem);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/product-availabilities')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAvailabilityResponse,
        });
      }
      if (typeof url === 'string' && url.includes('/api/v1/orders/quote')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockQuoteResponse,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    // Fill valid form
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'maria.gomez@correo.com' },
    });
    fireEvent.change(screen.getByLabelText(/Nombre y apellido completos/i), {
      target: { value: 'María Gómez' },
    });
    fireEvent.change(screen.getByLabelText(/Celular de quien recibe/i), {
      target: { value: '3105550142' },
    });
    fireEvent.change(screen.getByLabelText(/Departamento/i), {
      target: { value: '41' },
    });
    fireEvent.change(screen.getByLabelText(/Municipio o ciudad/i), {
      target: { value: '41551' },
    });
    fireEvent.change(screen.getByLabelText(/Dirección principal/i), {
      target: { value: 'Calle 5 # 12-34' },
    });

    // Accept data policy
    const consentButton = screen.getByRole('checkbox', {
      name: /Autorizo a Monteluna a tratar mis datos personales/i,
    });
    fireEvent.click(consentButton);

    await waitFor(() => {
      expect(screen.getByText(/Envío a Pitalito, Huila/i)).toBeDefined();
    });

    // Click submit
    const submitBtn = screen.getAllByRole('button', { name: /Continuar al pago/i })[0];
    fireEvent.click(submitBtn);

    // Expect step 3 view
    await waitFor(() => {
      expect(screen.getByText('Paso 3 de 3')).toBeDefined();
      expect(screen.getByText('Revisa y paga')).toBeDefined();
      expect(screen.getByText('Pagas en la ventana segura de Wompi.')).toBeDefined();
      expect(screen.getByRole('button', { name: /Pagar \$47\.500/i })).toBeDefined();
    });
  });

  it('supports separate recipient info when radio is changed', async () => {
    addItem(mockItem);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/product-availabilities')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAvailabilityResponse,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    // Select "Recibe otra persona"
    const radioOther = screen.getByLabelText(/Recibe otra persona/i);
    fireEvent.click(radioOther);

    // "Nombre de quien recibe" should now appear
    expect(screen.getByLabelText(/Nombre de quien recibe/i)).toBeDefined();
    expect(screen.getByLabelText(/Celular de quien recibe/i)).toBeDefined();
  });

  it('supports electronic invoice fields when checked', async () => {
    addItem(mockItem);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/product-availabilities')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAvailabilityResponse,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    // Check invoice checkbox
    const invoiceCheckbox = screen.getByLabelText(
      /Necesito factura electrónica a nombre de empresa o documento específico/i
    );
    fireEvent.click(invoiceCheckbox);

    // Document type and number should now appear
    expect(screen.getByLabelText(/Tipo de documento/i)).toBeDefined();
    expect(screen.getByLabelText(/Número de documento/i)).toBeDefined();

    // Switch to Empresa (Persona jurídica)
    const personaJuridicaRadio = screen.getByLabelText(/Persona jurídica \(empresa\)/i);
    fireEvent.click(personaJuridicaRadio);

    expect(
      screen.getByLabelText(/Número de NIT \(con dígito de verificación\)/i)
    ).toBeDefined();
  });
});
