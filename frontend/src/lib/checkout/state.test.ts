import { describe, expect, it, beforeEach } from 'vitest';
import {
  validateCheckoutForm,
  getDefaultCheckoutFormData,
  loadCheckoutData,
  saveCheckoutData,
  clearCheckoutData,
  loadPlacedOrder,
  savePlacedOrder,
  clearPlacedOrder,
  mapFormDataToPlaceOrderRequest,
  type CheckoutFormData,
} from './state';



describe('Checkout state and validation (S4, S5)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  const validForm: CheckoutFormData = {
    email: 'maria.gomez@correo.com',
    fullName: 'María Gómez',
    phone: '3001234567',
    sameRecipient: true,
    recipientName: '',
    recipientPhone: '3105550142',
    departmentCode: '41',
    municipalityCode: '41551',
    addressLine1: 'Calle 5 # 12-34',
    addressLine2: 'Apto 302',
    postalCode: '417030',
    deliveryNotes: 'Portería',
    wantsInvoice: false,
    personType: 'natural',
    documentType: 'CC',
    documentNumber: '',
    acceptsDataPolicy: true,
  };

  it('validates a complete valid form with 0 errors', () => {
    const result = validateCheckoutForm(validForm);
    expect(result.isValid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('fails when email is empty or invalid format', () => {
    const emptyResult = validateCheckoutForm({ ...validForm, email: '' });
    expect(emptyResult.isValid).toBe(false);
    expect(emptyResult.errors.email).toBeDefined();

    const invalidResult = validateCheckoutForm({ ...validForm, email: 'maria.gomez@correo' });
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.email).toContain('correo completo');
  });

  it('fails when full name is less than 3 chars', () => {
    const result = validateCheckoutForm({ ...validForm, fullName: 'Ma' });
    expect(result.isValid).toBe(false);
    expect(result.errors.fullName).toBeDefined();
  });

  it('validates optional buyer phone format', () => {
    // Empty is valid
    const emptyPhoneResult = validateCheckoutForm({ ...validForm, phone: '' });
    expect(emptyPhoneResult.errors.phone).toBeUndefined();

    // Valid 10-digit Colombian mobile starting with 3
    const validPhoneResult = validateCheckoutForm({ ...validForm, phone: '300 123 4567' });
    expect(validPhoneResult.errors.phone).toBeUndefined();

    // Invalid mobile (not starting with 3 or wrong length)
    const invalidPhoneResult = validateCheckoutForm({ ...validForm, phone: '2001234' });
    expect(invalidPhoneResult.errors.phone).toBeDefined();
  });

  it('validates recipient name only when sameRecipient is false', () => {
    const differentRecipient = {
      ...validForm,
      sameRecipient: false,
      recipientName: '',
    };
    const result = validateCheckoutForm(differentRecipient);
    expect(result.isValid).toBe(false);
    expect(result.errors.recipientName).toBeDefined();

    const filledRecipient = {
      ...differentRecipient,
      recipientName: 'Carlos Gómez',
    };
    expect(validateCheckoutForm(filledRecipient).isValid).toBe(true);
  });

  it('requires recipient phone for delivery coordination', () => {
    const emptyPhone = { ...validForm, recipientPhone: '' };
    const result = validateCheckoutForm(emptyPhone);
    expect(result.isValid).toBe(false);
    expect(result.errors.recipientPhone).toBeDefined();
  });

  it('requires department and municipality', () => {
    const missingDept = validateCheckoutForm({ ...validForm, departmentCode: '' });
    expect(missingDept.errors.departmentCode).toBeDefined();

    const missingMuni = validateCheckoutForm({ ...validForm, municipalityCode: '' });
    expect(missingMuni.errors.municipalityCode).toBeDefined();
  });

  it('requires address line 1 with at least 5 chars', () => {
    const emptyAddr = validateCheckoutForm({ ...validForm, addressLine1: '' });
    expect(emptyAddr.errors.addressLine1).toBeDefined();

    const shortAddr = validateCheckoutForm({ ...validForm, addressLine1: 'Cl 1' });
    expect(shortAddr.errors.addressLine1).toBeDefined();
  });

  it('validates optional postal code length (6 digits)', () => {
    const invalidPostal = validateCheckoutForm({ ...validForm, postalCode: '123' });
    expect(invalidPostal.errors.postalCode).toBeDefined();

    const validPostal = validateCheckoutForm({ ...validForm, postalCode: '417030' });
    expect(validPostal.errors.postalCode).toBeUndefined();
  });

  it('validates fiscal document number when invoice is requested', () => {
    const invoiceWithoutDoc = validateCheckoutForm({
      ...validForm,
      wantsInvoice: true,
      documentNumber: '',
    });
    expect(invoiceWithoutDoc.isValid).toBe(false);
    expect(invoiceWithoutDoc.errors.documentNumber).toBeDefined();

    const legalInvoice = validateCheckoutForm({
      ...validForm,
      wantsInvoice: true,
      personType: 'legal',
      documentType: 'NIT',
      documentNumber: '900.123.456-7',
    });
    expect(legalInvoice.isValid).toBe(true);
  });

  it('requires data policy consent to proceed', () => {
    const withoutConsent = validateCheckoutForm({
      ...validForm,
      acceptsDataPolicy: false,
    });
    expect(withoutConsent.isValid).toBe(false);
    expect(withoutConsent.errors.acceptsDataPolicy).toBeDefined();
  });

  it('saves and loads checkout form data from sessionStorage', () => {
    saveCheckoutData(validForm);
    const loaded = loadCheckoutData();
    expect(loaded).toEqual(validForm);

    clearCheckoutData();
    expect(loadCheckoutData()).toBeNull();
  });

  it('saves, loads, and clears placed order from sessionStorage', () => {
    const mockPlaced = {
      order_id: '01923456-789a-7bcd-ef01-23456789abcd',
      order_number: 'ORD-7K2M9Q4X',
      status: 'pending_payment',
      total_amount: 47500,
      reservation_expires_at: '2026-10-15T15:30:00Z',
      tracking_token: 'abc123_-xyz456_7890123456789012345678901234',
    };
    savePlacedOrder(mockPlaced);
    expect(loadPlacedOrder()).toEqual(mockPlaced);

    clearPlacedOrder();
    expect(loadPlacedOrder()).toBeNull();
  });

  it('maps CheckoutFormData and items to PlaceOrderRequest', () => {
    const items = [
      {
        variant_id: '01912345-6789-7abc-def0-123456789abc',
        product_slug: 'finca-el-mirador',
        product_name: 'Finca El Mirador',
        variant_label: '500 g / Grano entero',
        origin_name: 'Huila',
        quantity: 2,
        product_type: 'coffee' as const,
      },
    ];

    const mapped = mapFormDataToPlaceOrderRequest(validForm, items);
    expect(mapped.items).toEqual([
      {
        variant_id: '01912345-6789-7abc-def0-123456789abc',
        quantity: 2,
      },
    ]);
    expect(mapped.customer).toEqual({
      email: 'maria.gomez@correo.com',
      full_name: 'María Gómez',
      phone: '3001234567',
    });
    expect(mapped.shipping_address).toEqual({
      recipient_name: 'María Gómez',
      recipient_phone: '3105550142',
      municipality_code: '41551',
      address_line1: 'Calle 5 # 12-34',
      address_line2: 'Apto 302',
      postal_code: '417030',
      delivery_notes: 'Portería',
    });
    expect(mapped.fiscal_data).toBeNull();
    expect(mapped.accepts_data_policy).toBe(true);
  });

  it('maps separate recipient and electronic invoice to PlaceOrderRequest', () => {
    const items = [
      {
        variant_id: '01912345-6789-7abc-def0-123456789abc',
        product_slug: 'finca-el-mirador',
        product_name: 'Finca El Mirador',
        variant_label: '500 g / Grano entero',
        origin_name: 'Huila',
        quantity: 1,
        product_type: 'coffee' as const,
      },
    ];

    const separateRecipientForm: CheckoutFormData = {
      ...validForm,
      sameRecipient: false,
      recipientName: 'Carlos Gómez',
      recipientPhone: '3209876543',
      wantsInvoice: true,
      personType: 'legal',
      documentType: 'NIT',
      documentNumber: '900.123.456-7',
    };

    const mapped = mapFormDataToPlaceOrderRequest(separateRecipientForm, items);
    expect(mapped.shipping_address.recipient_name).toBe('Carlos Gómez');
    expect(mapped.shipping_address.recipient_phone).toBe('3209876543');
    expect(mapped.fiscal_data).toEqual({
      person_type: 'legal',
      document_type: 'NIT',
      document_number: '900123456-7',
    });
  });
});


