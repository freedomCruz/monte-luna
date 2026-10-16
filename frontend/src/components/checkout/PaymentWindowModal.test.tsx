import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PaymentWindowModal } from './PaymentWindowModal';

describe('PaymentWindowModal (S7, M-Checkout-Pago canvas)', () => {
  const expiresFuture = new Date(Date.now() + 29 * 60 * 1000).toISOString();

  it('renders modal dialog with order number, total, timer, and close button', () => {
    const handleClose = vi.fn();
    const handleSimulate = vi.fn();

    render(
      <PaymentWindowModal
        orderNumber="ORD-7K2M9Q4X"
        totalDisplay="$68.900"
        reservationExpiresAt={expiresFuture}
        onClose={handleClose}
        onSimulateReturn={handleSimulate}
      />
    );

    expect(screen.getByRole('dialog', { name: 'ORD-7K2M9Q4X' })).toBeDefined();
    expect(screen.getByText('Pedido creado')).toBeDefined();
    expect(screen.getByText('ORD-7K2M9Q4X')).toBeDefined();
    expect(screen.getByText(/Total a pagar: \$68\.900/i)).toBeDefined();
    expect(screen.getByText(/\[Aquí se abre la ventana de pago de Wompi\]/i)).toBeDefined();
    expect(screen.getAllByText(/Tu pedido sigue apartado/i).length).toBeGreaterThanOrEqual(1);

    // Close button
    const closeBtn = screen.getByRole('button', { name: /Cerrar la ventana de pago/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledOnce();

    // Simulate return button
    const simBtn = screen.getByRole('button', { name: /Simular el regreso del pago →/i });
    fireEvent.click(simBtn);
    expect(handleSimulate).toHaveBeenCalledOnce();
  });
});
