import { describe, expect, it, beforeEach } from 'vitest';
import {
  validateCheckoutForm,
  getDefaultCheckoutFormData,
  loadCheckoutData,
  saveCheckoutData,
  clearCheckoutData,
  type CheckoutFormData,
} from './checkout-state';

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

  it('requires recipient name when sameRecipient is false', () => {
    const differentRecipientEmpty = validateCheckoutForm({
      ...validForm,
      sameRecipient: false,
      recipientName: '',
    });
    expect(differentRecipientEmpty.isValid).toBe(false);
    expect(differentRecipientEmpty.errors.recipientName).toBeDefined();

    const differentRecipientValid = validateCheckoutForm({
      ...validForm,
      sameRecipient: false,
      recipientName: 'Carlos Gómez',
    });
    expect(differentRecipientValid.errors.recipientName).toBeUndefined();
  });

  it('requires recipient phone for delivery carrier', () => {
    const emptyRecipientPhone = validateCheckoutForm({
      ...validForm,
      recipientPhone: '',
    });
    expect(emptyRecipientPhone.isValid).toBe(false);
    expect(emptyRecipientPhone.errors.recipientPhone).toBeDefined();
  });

  it('validates address line 1 minimum length', () => {
    const shortAddress = validateCheckoutForm({
      ...validForm,
      addressLine1: 'Cl 1',
    });
    expect(shortAddress.isValid).toBe(false);
    expect(shortAddress.errors.addressLine1).toBeDefined();
  });

  it('requires department and municipality', () => {
    const missingMuni = validateCheckoutForm({
      ...validForm,
      municipalityCode: '',
    });
    expect(missingMuni.isValid).toBe(false);
    expect(missingMuni.errors.municipalityCode).toBeDefined();
  });

  it('validates invoice fields when invoice is requested', () => {
    const invoiceNoDoc = validateCheckoutForm({
      ...validForm,
      wantsInvoice: true,
      documentNumber: '',
    });
    expect(invoiceNoDoc.isValid).toBe(false);
    expect(invoiceNoDoc.errors.documentNumber).toBeDefined();

    const invoiceValid = validateCheckoutForm({
      ...validForm,
      wantsInvoice: true,
      personType: 'legal',
      documentType: 'NIT',
      documentNumber: '900.123.456-7',
    });
    expect(invoiceValid.errors.documentNumber).toBeUndefined();
  });

  it('requires data policy acceptance', () => {
    const noConsent = validateCheckoutForm({
      ...validForm,
      acceptsDataPolicy: false,
    });
    expect(noConsent.isValid).toBe(false);
    expect(noConsent.errors.acceptsDataPolicy).toBeDefined();
  });

  it('persists and loads data from sessionStorage', () => {
    expect(loadCheckoutData()).toBeNull();

    saveCheckoutData(validForm);
    const loaded = loadCheckoutData();
    expect(loaded).toEqual(validForm);

    clearCheckoutData();
    expect(loadCheckoutData()).toBeNull();
  });
});
