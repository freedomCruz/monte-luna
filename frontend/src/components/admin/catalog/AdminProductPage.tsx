import { AdminShell } from '../shell/AdminShell';
import { ProductView } from './product/ProductView';

export function AdminProductPage() {
  return (
    <AdminShell active="products" desktopOnly="catalog">
      <ProductView />
    </AdminShell>
  );
}
