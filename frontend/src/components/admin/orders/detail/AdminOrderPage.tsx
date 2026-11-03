import { AdminShell } from '../../shell/AdminShell';
import { OrderDetailView } from './OrderDetailView';

// The site is static, so the order id travels in the query string (orderDetailHref).
const orderIdFromAddress = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('id'));

export function AdminOrderPage() {
  return (
    <AdminShell active="orders">
      <OrderDetailView id={orderIdFromAddress()} />
    </AdminShell>
  );
}
