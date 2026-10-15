import type { components } from '../../generated/orders';

export type OrderQuoteRequest = components['schemas']['OrderQuoteRequest'];
export type OrderQuote = components['schemas']['OrderQuote'];
export type OrderQuoteResponse = OrderQuote;
export type CartItem = components['schemas']['CartItem'];
export type Problem = components['schemas']['Problem'];
export type ShippingSummary = components['schemas']['ShippingSummary'];
export type OrderLine = components['schemas']['OrderLine'];
export type PlaceOrderRequest = components['schemas']['PlaceOrderRequest'];
export type PlacedOrder = components['schemas']['PlacedOrder'];
export type GuestOrder = components['schemas']['GuestOrder'];
export type GuestOrderLine = components['schemas']['GuestOrderLine'];
export type GuestShippingAddress = components['schemas']['GuestShippingAddress'];
export type Shipment = components['schemas']['Shipment'];

export type OrderQuoteResult =
  | { ok: true; quote: OrderQuote }
  | { ok: false; code: string; status?: number; problem?: Problem };

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrder }
  | { ok: false; code: string; status?: number; problem?: Problem };

export type GetGuestOrderResult =
  | { ok: true; order: GuestOrder }
  | { ok: false; code: string; status?: number; problem?: Problem };

/**
 * Calculates checkout quote via POST /api/v1/orders/quote.
 * Server is authoritative for live prices, shipping, taxes, and totals.
 */
export async function requestOrderQuote(request: OrderQuoteRequest): Promise<OrderQuoteResult> {
  try {
    const response = await fetch('/api/v1/orders/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, application/problem+json',
      },
      body: JSON.stringify(request),
    });

    if (response.ok) {
      const quote = (await response.json()) as OrderQuote;
      return { ok: true, quote };
    }

    let problem: Problem | undefined;
    let code = `http_${response.status}`;
    try {
      problem = (await response.json()) as Problem;
      if (problem && problem.code) {
        code = problem.code;
      }
    } catch {
      // JSON parse failed; use status code fallback
    }

    return {
      ok: false,
      code,
      status: response.status,
      problem,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'network_error',
      problem: {
        type: 'https://api.monteluna.co/problems/network_error',
        title: 'Error de conexión',
        status: 0,
        code: 'network_error',
        detail: error instanceof Error ? error.message : 'Error al conectar con el servidor',
      },
    };
  }
}

/**
 * Places a guest order via POST /api/v1/orders.
 * Allocates inventory and sets a 30-minute stock reservation.
 * Requires an Idempotency-Key.
 */
export async function placeOrder(
  request: PlaceOrderRequest,
  idempotencyKey: string
): Promise<PlaceOrderResult> {
  try {
    const response = await fetch('/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, application/problem+json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(request),
    });

    if (response.ok) {
      const order = (await response.json()) as PlacedOrder;
      return { ok: true, order };
    }

    let problem: Problem | undefined;
    let code = `http_${response.status}`;
    try {
      problem = (await response.json()) as Problem;
      if (problem && problem.code) {
        code = problem.code;
      }
    } catch {
      // JSON parse failed; use status code fallback
    }

    return {
      ok: false,
      code,
      status: response.status,
      problem,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'network_error',
      problem: {
        type: 'https://api.monteluna.co/problems/network_error',
        title: 'Error de conexión',
        status: 0,
        code: 'network_error',
        detail: error instanceof Error ? error.message : 'Error al conectar con el servidor',
      },
    };
  }
}

/**
 * Reads a guest order by its private tracking token via GET /api/v1/orders/track?token=...
 */
export async function getGuestOrder(token: string): Promise<GetGuestOrderResult> {
  try {
    const response = await fetch(`/api/v1/orders/track?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json, application/problem+json',
      },
    });

    if (response.ok) {
      const order = (await response.json()) as GuestOrder;
      return { ok: true, order };
    }

    let problem: Problem | undefined;
    let code = `http_${response.status}`;
    try {
      problem = (await response.json()) as Problem;
      if (problem && problem.code) {
        code = problem.code;
      }
    } catch {
      // JSON parse failed
    }

    return {
      ok: false,
      code,
      status: response.status,
      problem,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'network_error',
      problem: {
        type: 'https://api.monteluna.co/problems/network_error',
        title: 'Error de conexión',
        status: 0,
        code: 'network_error',
        detail: error instanceof Error ? error.message : 'Error al conectar con el servidor',
      },
    };
  }
}

