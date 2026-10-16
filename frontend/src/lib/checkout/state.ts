import type { CartItem } from '../cart/store';
import type { PlaceOrderRequest } from '../orders/client';

export interface CheckoutFormData {
  // Buyer
  email: string;
  fullName: string;
  phone: string;

  // Delivery
  sameRecipient: boolean;
  recipientName: string;
  recipientPhone: string;
  departmentCode: string;
  municipalityCode: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  deliveryNotes: string;

  // Invoice
  wantsInvoice: boolean;
  personType: 'natural' | 'legal';
  documentType: 'CC' | 'CE' | 'PP' | 'NIT';
  documentNumber: string;

  // Consent
  acceptsDataPolicy: boolean;
}

export type CheckoutFormErrors = Partial<Record<keyof CheckoutFormData, string>>;

export interface ValidationResult {
  isValid: boolean;
  errors: CheckoutFormErrors;
}

export const CHECKOUT_STORAGE_KEY = 'monteluna:checkout-form';

export function getDefaultCheckoutFormData(): CheckoutFormData {
  return {
    email: '',
    fullName: '',
    phone: '',
    sameRecipient: true,
    recipientName: '',
    recipientPhone: '',
    departmentCode: '',
    municipalityCode: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    deliveryNotes: '',
    wantsInvoice: false,
    personType: 'natural',
    documentType: 'CC',
    documentNumber: '',
    acceptsDataPolicy: false,
  };
}

function cleanDigits(val: string): string {
  return val.replace(/[\s.-]/g, '');
}

export function validateCheckoutForm(data: CheckoutFormData): ValidationResult {
  const errors: CheckoutFormErrors = {};

  // Email
  const email = data.email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    errors.email = 'Escribe tu correo';
  } else if (!emailRegex.test(email) || email.length > 254) {
    errors.email = 'Escribe un correo completo, como nombre@correo.com';
  }

  // Full Name
  const fullName = data.fullName.trim();
  if (!fullName) {
    errors.fullName = 'Escribe tu nombre completo';
  } else if (fullName.length < 3) {
    errors.fullName = 'El nombre debe tener al menos 3 caracteres';
  } else if (fullName.length > 120) {
    errors.fullName = 'El nombre no puede exceder 120 caracteres';
  }

  // Buyer Phone (optional)
  const phone = cleanDigits(data.phone);
  if (phone) {
    if (!/^3[0-9]{9}$/.test(phone)) {
      errors.phone = 'Escribe un celular de 10 dígitos que empiece por 3';
    }
  }

  // Recipient Name
  if (!data.sameRecipient) {
    const recipientName = data.recipientName.trim();
    if (!recipientName) {
      errors.recipientName = 'Escribe el nombre de quien recibe';
    } else if (recipientName.length < 3) {
      errors.recipientName = 'El nombre debe tener al menos 3 caracteres';
    } else if (recipientName.length > 120) {
      errors.recipientName = 'El nombre no puede exceder 120 caracteres';
    }
  }

  // Recipient Phone (required for carrier)
  const recipientPhone = cleanDigits(data.recipientPhone);
  if (!recipientPhone) {
    errors.recipientPhone = 'Escribe el celular de quien recibe';
  } else if (!/^3[0-9]{9}$/.test(recipientPhone)) {
    errors.recipientPhone = 'Escribe un celular de 10 dígitos que empiece por 3';
  }

  // Department & Municipality
  if (!data.departmentCode.trim()) {
    errors.departmentCode = 'Selecciona un departamento';
  }
  if (!data.municipalityCode.trim()) {
    errors.municipalityCode = 'Selecciona tu municipio';
  }

  // Address line 1
  const addressLine1 = data.addressLine1.trim();
  if (!addressLine1) {
    errors.addressLine1 = 'Escribe la dirección de entrega';
  } else if (addressLine1.length < 5) {
    errors.addressLine1 = 'La dirección debe tener al menos 5 caracteres';
  } else if (addressLine1.length > 200) {
    errors.addressLine1 = 'La dirección no puede exceder 200 caracteres';
  }

  // Postal code (optional)
  const postalCode = cleanDigits(data.postalCode);
  if (postalCode) {
    if (!/^[0-9]{6}$/.test(postalCode)) {
      errors.postalCode = 'El código postal debe tener 6 dígitos';
    }
  }

  // Invoice (optional section)
  if (data.wantsInvoice) {
    const docNumber = data.documentNumber.trim().replace(/[\s.]/g, '');
    if (!docNumber) {
      errors.documentNumber =
        data.personType === 'legal' ? 'Escribe el NIT de la empresa' : 'Escribe el número de documento';
    } else if (docNumber.length < 3) {
      errors.documentNumber = 'El documento debe tener al menos 3 caracteres';
    } else if (docNumber.length > 20) {
      errors.documentNumber = 'El documento no puede exceder 20 caracteres';
    } else if (!/^[0-9A-Za-z-]+$/.test(docNumber)) {
      errors.documentNumber = 'El documento contiene caracteres inválidos';
    }
  }

  // Data policy consent
  if (!data.acceptsDataPolicy) {
    errors.acceptsDataPolicy = 'Marca esta casilla para poder continuar';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function loadCheckoutData(): CheckoutFormData | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutFormData;
  } catch {
    return null;
  }
}

export function saveCheckoutData(data: CheckoutFormData): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage write error ignored
  }
}

export function clearCheckoutData(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const PLACED_ORDER_STORAGE_KEY = 'monteluna:placed-order';

export interface StoredPlacedOrder {
  order_id: string;
  order_number: string;
  status: string;
  total_amount: number;
  reservation_expires_at: string;
  tracking_token: string;
}

export function loadPlacedOrder(): StoredPlacedOrder | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(PLACED_ORDER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPlacedOrder;
  } catch {
    return null;
  }
}

export function savePlacedOrder(order: StoredPlacedOrder): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(PLACED_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore
  }
}

export function clearPlacedOrder(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(PLACED_ORDER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function mapFormDataToPlaceOrderRequest(
  formData: CheckoutFormData,
  items: CartItem[]
): PlaceOrderRequest {
  const cleanPhone = (p: string) => {
    const cleaned = cleanDigits(p);
    return cleaned ? cleaned : null;
  };

  const recipientName = formData.sameRecipient
    ? formData.fullName.trim()
    : formData.recipientName.trim();
  const recipientPhone = cleanDigits(formData.recipientPhone);

  const fiscalData = formData.wantsInvoice
    ? {
        person_type: formData.personType,
        document_type: formData.documentType,
        document_number: formData.documentNumber.trim().replace(/[\s.]/g, ''),
      }
    : null;

  return {
    items: items.map((i) => ({
      variant_id: i.variant_id,
      quantity: i.quantity,
    })),
    customer: {
      email: formData.email.trim().toLowerCase(),
      full_name: formData.fullName.trim(),
      phone: cleanPhone(formData.phone),
    },
    shipping_address: {
      recipient_name: recipientName,
      recipient_phone: recipientPhone,
      municipality_code: formData.municipalityCode.trim(),
      address_line1: formData.addressLine1.trim(),
      address_line2: formData.addressLine2.trim() ? formData.addressLine2.trim() : null,
      postal_code: cleanDigits(formData.postalCode) || null,
      delivery_notes: formData.deliveryNotes.trim() ? formData.deliveryNotes.trim() : null,
    },
    fiscal_data: fiscalData,
    accepts_data_policy: true,
  };
}


