import { AdminShell } from '../shell/AdminShell';
import { InventoryView } from './InventoryView';

export function AdminInventoryPage() {
  return (
    <AdminShell active="inventory" desktopOnly="catalog">
      <InventoryView />
    </AdminShell>
  );
}
