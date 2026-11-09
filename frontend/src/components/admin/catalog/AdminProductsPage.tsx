import { AdminShell } from '../shell/AdminShell';
import { ProductsView } from './ProductsView';

export function AdminProductsPage() {
  return (
    <AdminShell active="products" desktopOnly="catalog">
      <ProductsView />
    </AdminShell>
  );
}
