import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OrderStatusBadge, PaymentStatusBadge } from './OrderBadges';

afterEach(cleanup);

describe('Order and payment badges (F1: S3, S4, S8)', () => {
  it('renders the order status label', () => {
    render(<OrderStatusBadge status="preparing" />);
    expect(screen.getByText('En preparación')).toBeTruthy();
  });

  it('renders the payment status label', () => {
    render(<PaymentStatusBadge status="declined" />);
    expect(screen.getByText('Rechazado')).toBeTruthy();
  });

  it('renders a dash when an order has no payment attempt', () => {
    render(<PaymentStatusBadge status={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
