import type { components } from '../../generated/payments';

export type PaymentCheckout = components['schemas']['PaymentCheckout'];
export type PaymentVerification = components['schemas']['PaymentVerification'];
export type StartPaymentRequest = components['schemas']['StartPaymentRequest'];
export type VerifyPaymentRequest = components['schemas']['VerifyPaymentRequest'];
export type Problem = components['schemas']['Problem'];

export type StartPaymentResult =
  | { ok: true; checkout: PaymentCheckout }
  | { ok: false; code: string; status?: number; problem?: Problem };

export type VerifyPaymentResult =
  | { ok: true; verification: PaymentVerification }
  | { ok: false; code: string; status?: number; problem?: Problem };

export interface WompiTransactionResult {
  id?: string;
  status?: string;
  reference?: string;
  [key: string]: unknown;
}

export interface WompiWidgetResult {
  transaction?: WompiTransactionResult;
  [key: string]: unknown;
}

export interface WidgetCheckoutInstance {
  open: (callback: (result: WompiWidgetResult) => void) => void;
  [key: string]: unknown;
}

export const WOMPI_WIDGET_SCRIPT_URL = 'https://checkout.wompi.co/widget.js';

/**
 * Initiates a payment attempt for a placed order in pending_payment status.
 * Requires tracking token in body and a fresh Idempotency-Key UUID.
 */
export async function startPayment(
  trackingToken: string,
  idempotencyKey: string
): Promise<StartPaymentResult> {
  try {
    const response = await fetch('/api/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, application/problem+json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ tracking_token: trackingToken }),
    });

    if (response.ok) {
      const checkout = (await response.json()) as PaymentCheckout;
      return { ok: true, checkout };
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
        type: 'https://monteluna.co/problems/network_error',
        title: 'Error de conexión',
        status: 0,
        code: 'network_error',
        detail: error instanceof Error ? error.message : 'Error al conectar con el servidor',
      },
    };
  }
}

/**
 * Reconciles an order payment with the backend using the tracking token and optional transaction ID hint.
 */
export async function verifyPayment(
  trackingToken: string,
  transactionId: string | null
): Promise<VerifyPaymentResult> {
  try {
    const response = await fetch('/api/v1/payments/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, application/problem+json',
      },
      body: JSON.stringify({
        tracking_token: trackingToken,
        transaction_id: transactionId,
      }),
    });

    if (response.ok) {
      const verification = (await response.json()) as PaymentVerification;
      return { ok: true, verification };
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
        type: 'https://monteluna.co/problems/network_error',
        title: 'Error de conexión',
        status: 0,
        code: 'network_error',
        detail: error instanceof Error ? error.message : 'Error al conectar con el servidor',
      },
    };
  }
}

/**
 * Dynamically loads the Wompi Web Checkout widget script if not already present.
 * Ensures the script is injected only once when the buyer clicks "Pagar" (S7, Gate G2, L6).
 */
export function loadWompiWidgetScript(scriptUrl = WOMPI_WIDGET_SCRIPT_URL): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    if ((window as any).WidgetCheckout) {
      resolve();
      return;
    }

    const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existingScript) {
      if ((window as any).WidgetCheckout) {
        resolve();
      } else {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', (e) => reject(e), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
}

/**
 * Opens the Wompi Web Checkout widget with the provided parameters, mapping snake_case to widget parameters.
 */
export function openWompiWidget(
  checkout: PaymentCheckout,
  onResult: (result: WompiWidgetResult) => void
): WidgetCheckoutInstance {
  const WidgetCheckout = (window as any).WidgetCheckout;
  if (!WidgetCheckout) {
    throw new Error('Wompi WidgetCheckout is not available');
  }

  const widget = new WidgetCheckout({
    currency: checkout.currency,
    amountInCents: checkout.amount_in_cents,
    reference: checkout.reference,
    publicKey: checkout.public_key,
    signature: {
      integrity: checkout.integrity_signature,
    },
    expirationTime: checkout.expires_at,
    redirectUrl: checkout.redirect_url,
  });

  widget.open(onResult);
  return widget;
}
