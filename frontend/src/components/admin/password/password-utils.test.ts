import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countCodePoints,
  extractAndClearToken,
  validatePasswordLength,
} from './password-utils';

describe('password-utils (T5: S2, S4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  describe('countCodePoints and validatePasswordLength (S2)', () => {
    it('correctly counts ASCII and Unicode code points', () => {
      expect(countCodePoints('cafedemontana')).toBe(13);
      expect(countCodePoints('café')).toBe(4);
      // '☕' is a single Unicode code point U+2615
      expect(countCodePoints('cafe☕1234567')).toBe(12);
    });

    it('enforces strictly 12 to 128 Unicode code points', () => {
      expect(validatePasswordLength('12345678901')).toBe(false); // 11
      expect(validatePasswordLength('123456789012')).toBe(true); // 12
      expect(validatePasswordLength('a'.repeat(128))).toBe(true); // 128
      expect(validatePasswordLength('a'.repeat(129))).toBe(false); // 129
    });
  });

  describe('extractAndClearToken (S4)', () => {
    it('extracts token from hash and removes it from address bar immediately', () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      window.location.hash = '#token=secret-token-12345';

      const token = extractAndClearToken();

      expect(token).toBe('secret-token-12345');
      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', window.location.pathname + window.location.search);
    });

    it('returns null and does not clear URL when token param is absent', () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      window.location.hash = '#something-else=foo';

      const token = extractAndClearToken();

      expect(token).toBeNull();
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('returns null when hash is empty', () => {
      window.location.hash = '';
      expect(extractAndClearToken()).toBeNull();
    });
  });
});
