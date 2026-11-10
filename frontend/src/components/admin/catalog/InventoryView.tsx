import * as React from 'react';
import {
  getAdminInventoryVariant,
  listAdminInventoryVariants,
  type AdminInventoryVariant,
  type AdminLotReceipt,
} from '../../../lib/admin/catalog';
import {
  DEFAULT_INVENTORY_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  toListQuery,
  type InventoryFilters,
} from '../../../lib/admin/inventory-query';
import { useMinWidth } from '../../../lib/admin/use-min-width';
import { replaceAddressSearch } from '../../../lib/admin/history';
import { ListPagination } from '../shared/ListPagination';
import { useRefreshLowStockCount } from '../shell/AdminShell';
import { LotsSection, MovementsSection } from './InventoryLedger';
import { VariantPanel, VariantSelect, type VariantListLoad } from './InventoryVariantList';
import { LotReceiptSheet } from './LotReceiptSheet';

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: AdminInventoryVariant[]; nextCursor: string | null; total: number };
type DetailState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; variant: AdminInventoryVariant; etag: string | null };

const NOUN = { singular: 'variante', plural: 'variantes' };

function initialFilters(): InventoryFilters {
  return typeof window === 'undefined' ? DEFAULT_INVENTORY_FILTERS : filtersFromSearch(window.location.search);
}

function Stat({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <span className="text-[30px] font-extrabold leading-none">{value}</span>
      <span className="text-[13px] text-muted-foreground">{caption}</span>
    </div>
  );
}

/** Inventario y lotes (A-Inventario): variant list, stock summary, lots and the movement ledger of the selected variant. */
export function InventoryView() {
  const wide = useMinWidth(1024);
  const refreshLowStockBadge = useRefreshLowStockCount();
  const [filters, setFilters] = React.useState<InventoryFilters>(initialFilters);
  const [searchText, setSearchText] = React.useState(filters.search);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [cursors, setCursors] = React.useState<string[]>([]);
  const [list, setList] = React.useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const silentReload = React.useRef(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DetailState>({ status: 'loading' });
  const [detailReload, setDetailReload] = React.useState(0);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const cursor = pageIndex === 0 ? undefined : cursors[pageIndex - 1];
  const queryKey = JSON.stringify(toListQuery(filters, cursor));

  React.useEffect(() => {
    let live = true;
    if (silentReload.current) silentReload.current = false;
    else setList({ status: 'loading' });
    void listAdminInventoryVariants(JSON.parse(queryKey)).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setList({ status: 'error' });
        return;
      }
      setList({ status: 'ready', rows: result.data.items, nextCursor: result.data.next_cursor, total: result.data.total });
    });
    return () => { live = false; };
  }, [queryKey, attempt]);

  // Keep the address bar in step so reloads and shared links restore the view.
  React.useEffect(() => {
    replaceAddressSearch(filtersToSearch(filters));
  }, [filters]);

  const resetPaging = () => { setPageIndex(0); setCursors([]); };
  const change = (patch: Partial<InventoryFilters>) => { setFilters((current) => ({ ...current, ...patch })); resetPaging(); };
  const clear = () => change({ productId: '', status: 'all', lowStock: false });
  const clearAll = () => { setSearchText(''); change({ search: '', productId: '', status: 'all', lowStock: false }); };

  // Typing waits a moment before it queries the API.
  React.useEffect(() => {
    if (searchText === filters.search) return;
    const timer = window.setTimeout(() => { setFilters((current) => ({ ...current, search: searchText })); resetPaging(); }, 350);
    return () => window.clearTimeout(timer);
  }, [searchText, filters.search]);

  const rows = list.status === 'ready' ? list.rows : [];
  const variantId = rows.some((row) => row.variant_id === selectedId) ? selectedId : (rows[0]?.variant_id ?? null);
  const listRow = rows.find((row) => row.variant_id === variantId) ?? null;

  // The variant detail carries the parent product ETag every lot receipt needs.
  React.useEffect(() => {
    if (variantId === null) return;
    let live = true;
    setDetail((current) => (current.status === 'ready' && current.variant.variant_id === variantId ? current : { status: 'loading' }));
    void getAdminInventoryVariant(variantId).then((result) => {
      if (!live) return;
      setDetail(result.ok ? { status: 'ready', variant: result.data, etag: result.etag } : { status: 'error' });
    });
    return () => { live = false; };
  }, [variantId, detailReload]);

  const next = () => {
    if (list.status !== 'ready' || list.nextCursor === null) return;
    const nextCursor = list.nextCursor;
    setCursors((current) => { const copy = [...current]; copy[pageIndex] = nextCursor; return copy; });
    setPageIndex((index) => index + 1);
  };

  const reloadDetail = () => setDetailReload((value) => value + 1);
  const onReceived = (receipt: AdminLotReceipt, etag: string | null) => {
    setSheetOpen(false);
    // The write advanced the product version: carry its ETag now, then read everything again.
    setDetail((current) => (current.status === 'ready' ? { ...current, etag } : current));
    setNotice(`Entrada registrada en el lote ${receipt.lot_code}: +${receipt.quantity_received} ${receipt.quantity_received === 1 ? 'unidad' : 'unidades'}.`);
    reloadDetail();
    silentReload.current = true;
    setAttempt((value) => value + 1);
    refreshLowStockBadge();
  };

  const detailVariant = detail.status === 'ready' && detail.variant.variant_id === variantId ? detail.variant : null;
  const summary = detailVariant ?? listRow;
  const listLoad: VariantListLoad = list.status === 'ready' ? { status: 'ready', rows: list.rows } : { status: list.status };
  const listProps = {
    searchText,
    onSearchText: setSearchText,
    filters,
    onChange: change,
    onClear: clear,
    load: listLoad,
    selectedId: variantId,
    onSelect: (id: string) => { setSelectedId(id); setNotice(null); },
    onRetry: () => setAttempt((value) => value + 1),
  };

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pb-12 pt-7 leading-[normal] min-[1024px]:px-6 min-[1440px]:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.01em]">Inventario y lotes</h1>
          <p className="m-0 text-[15px] text-muted-foreground">El stock vive en lotes. Cada venta sale primero del lote más antiguo.</p>
        </div>
        {detailVariant && (
          <button type="button" onClick={() => { setNotice(null); setSheetOpen(true); }} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border-0 bg-accent px-4 font-sans text-[15px] font-bold text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Registrar entrada de lote
          </button>
        )}
      </div>

      {notice && <p role="status" className="m-0 rounded-md border border-success bg-card px-4 py-3 text-[15px] font-bold text-success">{notice}</p>}

      <div className="flex flex-wrap items-start gap-5">
        {wide ? (
          <VariantPanel
            {...listProps}
            onClearAll={clearAll}
            footer={list.status === 'ready' && list.rows.length > 0 && (
              <ListPagination
                start={pageIndex * filters.limit + 1}
                count={list.rows.length}
                total={list.total}
                limit={filters.limit}
                onLimit={(limit) => change({ limit })}
                hasPrevious={pageIndex > 0}
                hasNext={list.nextCursor !== null}
                onPrevious={() => setPageIndex((index) => Math.max(0, index - 1))}
                onNext={next}
                noun={NOUN}
                showLimit={false}
              />
            )}
          />
        ) : (
          <div className="w-full"><VariantSelect {...listProps} /></div>
        )}

        {summary && variantId && (
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 text-[22px] font-extrabold">{summary.product_title} · {summary.variant_label}</h2>
              <span className="text-sm text-muted-foreground">SKU {summary.sku}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Disponible" value={summary.available_quantity} caption="unidades para vender" />
              <Stat label="Reservado" value={summary.reserved_quantity} caption="en pedidos esperando pago (30 min)" />
              <Stat label="Lotes activos" value={summary.active_lot_count} caption="con unidades disponibles" />
            </div>
            {detail.status === 'error' && (
              <div role="alert" className="flex flex-col items-start gap-2.5 rounded-md border-2 border-foreground bg-card p-3.5 text-sm">
                <span className="font-extrabold">No pudimos leer la versión del producto, necesaria para registrar entradas.</span>
                <button type="button" onClick={reloadDetail} className="h-11 cursor-pointer rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Reintentar</button>
              </div>
            )}
            <LotsSection variantId={variantId} reload={detailReload} />
            <MovementsSection variantId={variantId} reload={detailReload} />
          </div>
        )}
      </div>

      {sheetOpen && detailVariant && detail.status === 'ready' && (
        <LotReceiptSheet variant={detailVariant} etag={detail.etag} onClose={() => setSheetOpen(false)} onReceived={onReceived} onReload={reloadDetail} />
      )}
    </main>
  );
}
