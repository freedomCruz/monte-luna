import type { components as OrdersComponents, operations as OrdersOperations } from '../../generated/orders';
import type { components as ShippingComponents } from '../../generated/shipping';
import { queryString, request, type AdminResult } from './client';

// Typed client for the admin orders and dispatch API (contracts/openapi/orders.yaml
// and shipping.yaml). Every write sends the record version as a strong If-Match
// ETag; a stale one is 412 `version_conflict` and callers reload the order.

export type OrderStatus = OrdersComponents['schemas']['OrderStatus'];
export type AdminOrderRow = OrdersComponents['schemas']['AdminOrderRow'];
export type AdminOrderPage = OrdersComponents['schemas']['AdminOrderPage'];
export type AdminOrder = OrdersComponents['schemas']['AdminOrder'];
export type AdminOrderLine = OrdersComponents['schemas']['AdminOrderLine'];
export type AdminOrderHistory = OrdersComponents['schemas']['AdminOrderHistory'];
export type AdminPaymentAttempt = OrdersComponents['schemas']['AdminPaymentAttempt'];
export type AdminPaymentSummary = OrdersComponents['schemas']['AdminPaymentSummary'];
export type AdminPaymentStatus = OrdersComponents['schemas']['AdminPaymentStatus'];
export type AdminPaymentMethod = OrdersComponents['schemas']['AdminPaymentMethod'];
export type AdminShipment = OrdersComponents['schemas']['AdminShipment'];
export type AdminOrderMetrics = OrdersComponents['schemas']['AdminOrderMetrics'];
export type CancelAdminOrder = OrdersComponents['schemas']['CancelAdminOrder'];
export type DispatchAdminOrder = ShippingComponents['schemas']['DispatchAdminOrder'];
export type ListAdminOrdersQuery = NonNullable<OrdersOperations['listAdminOrders']['parameters']['query']>;
export type AdminOrderMetricsQuery = NonNullable<OrdersOperations['getAdminOrderMetrics']['parameters']['query']>;

const ordersPath = '/api/v1/admin/orders';
const orderPath = (id: string) => `${ordersPath}/${encodeURIComponent(id)}`;

/** Searches and paginates orders; `pending_dispatch_count` is global, unaffected by filters. */
export function listAdminOrders(params: ListAdminOrdersQuery = {}) {
  return request<AdminOrderPage>('GET', `${ordersPath}${queryString(params)}`);
}

/** Reads the dashboard metrics for a period (order data only). */
export function getAdminOrderMetrics(params: AdminOrderMetricsQuery = {}) {
  return request<AdminOrderMetrics>('GET', `${ordersPath}/metrics${queryString(params)}`);
}

/** Reads the complete order; the ETag is the order `If-Match` for every action. */
export function getAdminOrder(id: string) {
  return request<AdminOrder>('GET', orderPath(id));
}

/** paid → preparing. `etag` must be the exact order ETag from the last read. */
export function prepareAdminOrder(id: string, etag: string) {
  return request<AdminOrder>('POST', `${orderPath(id)}/to-preparing`, { body: {}, ifMatch: etag });
}

/** shipped → delivered; the caller confirms with the user first. */
export function deliverAdminOrder(id: string, etag: string) {
  return request<AdminOrder>('POST', `${orderPath(id)}/deliver`, { body: {}, ifMatch: etag });
}

/** paid or preparing → cancelled, with an optional reason recorded in the history. */
export function cancelAdminOrder(id: string, etag: string, body: CancelAdminOrder = {}) {
  return request<AdminOrder>('POST', `${orderPath(id)}/cancel`, { body, ifMatch: etag });
}

/**
 * Registers the dispatch of a paid or preparing order. `id` is the ORDER id and
 * `etag` the order ETag; the 200 response is the shipment, and its ETag quotes the
 * shipment version, so reload the order before any further action.
 */
export function dispatchAdminOrder(id: string, etag: string, body: DispatchAdminOrder) {
  return request<AdminShipment>('POST', `${orderPath(id)}/dispatch`, { body, ifMatch: etag });
}

/** True when a write was rejected because the record changed (412 `version_conflict`). */
export function isVersionConflict(result: AdminResult<unknown>): boolean {
  return !result.ok && (result.status === 412 || result.code === 'version_conflict');
}
