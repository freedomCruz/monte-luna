import * as React from 'react';
import { listAdminOrders, type AdminOrderRow } from '../../../lib/admin/orders';
import {
  DEFAULT_ORDER_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  pendingDispatchFilters,
  toListQuery,
  type OrderFilters,
} from '../../../lib/admin/orders-query';
import { isMobileWidth, useIsMobile } from '../../../lib/admin/use-is-mobile';
import { replaceAddressSearch } from '../../../lib/admin/history';
import { useReportPendingDispatchCount } from '../shell/AdminShell';
import { OrdersFilters } from './OrdersFilters';
import { OrdersCards, OrdersTable } from './OrdersList';
import { ListPagination } from '../shared/ListPagination';
import { OrdersEmpty, OrdersError, OrdersNoMatches, OrdersSkeleton } from './OrdersStates';

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: AdminOrderRow[]; nextCursor: string | null; total: number };

// The 390 px canvas opens on "Por despachar"; a link or reload that carries filters wins.
function initialFilters(): OrderFilters {
  if (typeof window === 'undefined') return DEFAULT_ORDER_FILTERS;
  const fromAddress = filtersFromSearch(window.location.search);
  return window.location.search === '' && isMobileWidth() ? pendingDispatchFilters() : fromAddress;
}

const CHIP = 'flex-none h-11 cursor-pointer rounded-sm border px-3 font-sans text-sm font-bold';

function MobileChips({ pendingDispatch, pendingCount, onPending, onAll }: { pendingDispatch: boolean; pendingCount: number | null; onPending: () => void; onAll: () => void }) {
  const state = (on: boolean) => (on ? 'border-brand-green bg-brand-green text-background' : 'border-muted-foreground bg-card text-foreground');
  return (
    <div role="group" aria-label="Filtrar" className="flex gap-1.5 overflow-x-auto">
      <button type="button" aria-pressed={pendingDispatch} onClick={onPending} className={`${CHIP} ${state(pendingDispatch)}`}>{pendingCount === null ? 'Por despachar' : `Por despachar · ${pendingCount}`}</button>
      <button type="button" aria-pressed={!pendingDispatch} onClick={onAll} className={`${CHIP} ${state(!pendingDispatch)}`}>Todos</button>
    </div>
  );
}

/** Pedidos (A-Pedidos): search, filters, table or cards, cursor pagination. */
export function OrdersView() {
  const report = useReportPendingDispatchCount();
  const mobile = useIsMobile();
  const [filters, setFilters] = React.useState<OrderFilters>(initialFilters);
  const [searchText, setSearchText] = React.useState(filters.search);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [cursors, setCursors] = React.useState<string[]>([]);
  const [load, setLoad] = React.useState<Load>({ status: 'loading' });
  const [pendingCount, setPendingCount] = React.useState<number | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  const cursor = pageIndex === 0 ? undefined : cursors[pageIndex - 1];
  const queryKey = JSON.stringify(toListQuery(filters, cursor));

  React.useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    void listAdminOrders(JSON.parse(queryKey)).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setLoad({ status: 'error' });
        return;
      }
      setLoad({ status: 'ready', rows: result.data.items, nextCursor: result.data.next_cursor, total: result.data.total });
      setPendingCount(result.data.pending_dispatch_count);
      report(result.data.pending_dispatch_count);
    });
    return () => { live = false; };
  }, [queryKey, attempt, report]);

  // Keep the address bar in step so reloads and shared links restore the view.
  React.useEffect(() => {
    replaceAddressSearch(filtersToSearch(filters));
  }, [filters]);

  const resetPaging = () => { setPageIndex(0); setCursors([]); };
  const applyFilters = (next: OrderFilters) => { setFilters(next); resetPaging(); };
  const change = (patch: Partial<OrderFilters>) => applyFilters({ ...filters, ...patch });
  const clear = () => applyFilters({ ...DEFAULT_ORDER_FILTERS, search: filters.search, sort: filters.sort, limit: filters.limit });

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

  const loadMore = async () => {
    if (load.status !== 'ready' || load.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const result = await listAdminOrders(toListQuery(filters, load.nextCursor));
    setLoadingMore(false);
    if (!result.ok) return;
    setLoad({ status: 'ready', rows: [...load.rows, ...result.data.items], nextCursor: result.data.next_cursor, total: result.data.total });
    setPendingCount(result.data.pending_dispatch_count);
    report(result.data.pending_dispatch_count);
  };

  const ready = load.status === 'ready' ? load : null;
  const narrowed = filters.status.length > 0 || filters.methods.length > 0 || filters.pendingDispatch || filters.dateFilter !== 'last_30_days' || filters.search.trim() !== '';

  const body = (() => {
    if (load.status === 'loading') return <OrdersSkeleton />;
    if (load.status === 'error') return <OrdersError onRetry={() => setAttempt((value) => value + 1)} />;
    if (load.rows.length === 0) return narrowed ? <OrdersNoMatches onClear={() => { setSearchText(''); applyFilters({ ...DEFAULT_ORDER_FILTERS, sort: filters.sort, limit: filters.limit }); }} /> : <OrdersEmpty />;
    return null;
  })();

  if (mobile) {
    return (
      <main className="flex flex-1 flex-col gap-3 px-4 pb-[104px] pt-[18px]">
        <h1 className="m-0 text-[26px] font-extrabold leading-[1.1]">Pedidos</h1>
        <label className="flex h-11 items-center gap-2.5 rounded-sm border border-muted-foreground bg-card px-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <span className="sr-only">Buscar pedidos</span>
          <input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Número o cliente" className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans text-base text-foreground placeholder:text-muted-foreground" />
        </label>
        <MobileChips
          pendingDispatch={filters.pendingDispatch}
          pendingCount={pendingCount}
          onPending={() => applyFilters({ ...pendingDispatchFilters(), search: filters.search })}
          onAll={() => applyFilters({ ...DEFAULT_ORDER_FILTERS, search: filters.search })}
        />
        {ready && ready.rows.length > 0 && (
          <span role="status" className="text-[13px] text-muted-foreground">{filters.pendingDispatch ? `${ready.total} pedidos pagados esperan despacho` : `${ready.total} pedidos · los más recientes primero`}</span>
        )}
        {body ? <section aria-label="Lista de pedidos" className="rounded-md border border-border bg-card">{body}</section> : ready && (
          <>
            <OrdersCards rows={ready.rows} />
            {ready.nextCursor !== null && (
              <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="h-12 cursor-pointer rounded-sm border border-muted-foreground bg-card font-sans text-[15px] font-bold text-foreground disabled:opacity-60">Cargar más pedidos</button>
            )}
          </>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pb-12 pt-7 min-[1024px]:px-6 min-[1440px]:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.01em]">Pedidos</h1>
          <p className="m-0 text-[15px] text-muted-foreground">Los pedidos nacen en la tienda; aquí se preparan, se despachan y se siguen.</p>
        </div>
        {pendingCount !== null && pendingCount > 0 && (
          <button type="button" onClick={() => applyFilters(pendingDispatchFilters())} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border-0 bg-accent px-4 font-sans text-[15px] font-bold text-white">Ver despachos pendientes · {pendingCount}</button>
        )}
      </div>

      <OrdersFilters searchText={searchText} onSearchText={setSearchText} filters={filters} onChange={change} onClear={clear} />

      <section aria-label="Lista de pedidos" className="flex flex-col rounded-md border border-border bg-card">
        {body ?? (ready && (
          <>
            <OrdersTable rows={ready.rows} sort={filters.sort} onToggleSort={() => change({ sort: filters.sort === 'placed_at' ? '-placed_at' : 'placed_at' })} />
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
            />
          </>
        ))}
      </section>
    </main>
  );
}
