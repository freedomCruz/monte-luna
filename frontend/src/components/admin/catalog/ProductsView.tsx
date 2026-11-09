import * as React from 'react';
import {
  listAdminCatalogCategories,
  listAdminCatalogProductTypes,
  listAdminProducts,
  type AdminCategory,
  type AdminProductRow,
} from '../../../lib/admin/catalog';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import {
  DEFAULT_PRODUCT_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  toListQuery,
  type ProductFilters,
} from '../../../lib/admin/products-query';
import { ListPagination } from '../shared/ListPagination';
import { ProductSheet } from './ProductSheet';
import { ProductsFilters } from './ProductsFilters';
import { ProductsTable } from './ProductsTable';
import { ProductsEmpty, ProductsError, ProductsNoMatches, ProductsSkeleton } from './ProductsStates';

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: AdminProductRow[]; nextCursor: string | null; total: number };

interface Taxonomy {
  productTypes: { id: string; name: string }[];
  categories: Pick<AdminCategory, 'id' | 'name'>[];
}

const NOUN = { singular: 'producto', plural: 'productos' };

function initialFilters(): ProductFilters {
  return typeof window === 'undefined' ? DEFAULT_PRODUCT_FILTERS : filtersFromSearch(window.location.search);
}

/** Productos (A-Productos): search, filters, sortable table and cursor pagination. */
export function ProductsView() {
  const [filters, setFilters] = React.useState<ProductFilters>(initialFilters);
  const [searchText, setSearchText] = React.useState(filters.search);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [cursors, setCursors] = React.useState<string[]>([]);
  const [load, setLoad] = React.useState<Load>({ status: 'loading' });
  const [taxonomy, setTaxonomy] = React.useState<Taxonomy>({ productTypes: [], categories: [] });
  const [attempt, setAttempt] = React.useState(0);
  const [sheet, setSheet] = React.useState<{ id: string; title: string } | null>(null);

  const cursor = pageIndex === 0 ? undefined : cursors[pageIndex - 1];
  const queryKey = JSON.stringify(toListQuery(filters, cursor));

  React.useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    void listAdminProducts(JSON.parse(queryKey)).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setLoad({ status: 'error' });
        return;
      }
      setLoad({ status: 'ready', rows: result.data.items, nextCursor: result.data.next_cursor, total: result.data.total });
    });
    return () => { live = false; };
  }, [queryKey, attempt]);

  // Taxonomy feeds the filter menus; a failure leaves them empty and the list usable.
  React.useEffect(() => {
    let live = true;
    void Promise.all([listAdminCatalogProductTypes({ limit: 100 }), listAdminCatalogCategories({ status: 'all', limit: 100 })]).then(([types, categories]) => {
      if (!live) return;
      setTaxonomy({
        productTypes: types.ok ? types.data.items : [],
        categories: categories.ok ? categories.data.items : [],
      });
    });
    return () => { live = false; };
  }, []);

  // Keep the address bar in step so reloads and shared links restore the view.
  React.useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${filtersToSearch(filters)}`);
  }, [filters]);

  const resetPaging = () => { setPageIndex(0); setCursors([]); };
  const change = (patch: Partial<ProductFilters>) => { setFilters((current) => ({ ...current, ...patch })); resetPaging(); };
  const clear = () => change({ typeIds: [], categoryIds: [], status: [], lowStock: false });
  const clearAll = () => { setSearchText(''); change({ search: '', typeIds: [], categoryIds: [], status: [], lowStock: false }); };

  // Typing waits a moment before it queries the API.
  React.useEffect(() => {
    if (searchText === filters.search) return;
    const timer = window.setTimeout(() => { setFilters((current) => ({ ...current, search: searchText })); resetPaging(); }, 350);
    return () => window.clearTimeout(timer);
  }, [searchText, filters.search]);

  const next = () => {
    if (load.status !== 'ready' || load.nextCursor === null) return;
    const nextCursor = load.nextCursor;
    setCursors((current) => { const copy = [...current]; copy[pageIndex] = nextCursor; return copy; });
    setPageIndex((index) => index + 1);
  };

  const ready = load.status === 'ready' ? load : null;
  const narrowed = filters.typeIds.length > 0 || filters.categoryIds.length > 0 || filters.status.length > 0 || filters.lowStock || filters.search.trim() !== '';

  const body = (() => {
    if (load.status === 'loading') return <ProductsSkeleton />;
    if (load.status === 'error') return <ProductsError onRetry={() => setAttempt((value) => value + 1)} />;
    if (load.rows.length === 0) return narrowed ? <ProductsNoMatches onClear={clearAll} /> : <ProductsEmpty />;
    return null;
  })();

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pb-12 pt-7 min-[1024px]:px-6 min-[1440px]:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.01em]">Productos</h1>
          <p className="m-0 text-[15px] text-muted-foreground">Café y cacao de la tienda. Abre un producto para editar sus variantes, precios e imágenes.</p>
        </div>
        <a href={ADMIN_ROUTES.product} className="inline-flex h-11 items-center gap-2 rounded-sm bg-accent px-4 text-[15px] font-bold text-white no-underline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo producto
        </a>
      </div>

      <ProductsFilters
        searchText={searchText}
        onSearchText={setSearchText}
        filters={filters}
        productTypes={taxonomy.productTypes}
        categories={taxonomy.categories}
        onChange={change}
        onClear={clear}
      />

      <section aria-label="Lista de productos" className="flex flex-col rounded-md border border-border bg-card">
        {body ?? (ready && (
          <>
            <ProductsTable rows={ready.rows} sort={filters.sort} onSort={(sort) => change({ sort })} onOpen={(row) => setSheet({ id: row.id, title: row.title })} />
            <ListPagination
              start={pageIndex * filters.limit + 1}
              count={ready.rows.length}
              total={ready.total}
              limit={filters.limit}
              onLimit={(limit) => change({ limit })}
              hasPrevious={pageIndex > 0}
              hasNext={ready.nextCursor !== null}
              onPrevious={() => setPageIndex((index) => Math.max(0, index - 1))}
              onNext={next}
              noun={NOUN}
            />
          </>
        ))}
      </section>
      {sheet && <ProductSheet productId={sheet.id} fallbackTitle={sheet.title} onClose={() => setSheet(null)} onSaved={() => setAttempt((value) => value + 1)} />}
    </main>
  );
}
