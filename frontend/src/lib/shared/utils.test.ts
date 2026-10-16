import { describe, expect, it } from 'vitest';
import { cn, generateUuid } from './utils';

describe('cn', () => {
  it('merges conditional classes and replaces conflicting Tailwind utilities', () => {
    expect(cn('px-2', false && 'hidden', 'px-4', { 'bg-card': true })).toBe('px-4 bg-card');
  });
});

describe('generateUuid', () => {
  it('generates a valid UUID string', () => {
    const uuid = generateUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

