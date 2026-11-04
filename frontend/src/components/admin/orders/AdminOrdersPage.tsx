import { AdminShell } from '../shell/AdminShell';
import { OrdersView } from './OrdersView';

export function AdminOrdersPage() {
  return (
    <AdminShell active="orders">
      <OrdersView />
    </AdminShell>
  );
}
