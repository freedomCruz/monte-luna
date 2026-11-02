/**
 * Utilities for admin password reset and invitation flows (T5).
 * Follows Identity domain rules (S2, S4):
 * - Passwords enforce strictly 12 to 128 Unicode code points with no composition rules.
 * - Reset and invitation tokens are read from the URL fragment and immediately stripped
 *   from the address bar to prevent logging in referrers or browser history.
 */

export const MIN_PASSWORD_CODE_POINTS = 12;
export const MAX_PASSWORD_CODE_POINTS = 128;

/**
 * Counts Unicode code points using Array.from (handles full Unicode range including surrogate pairs).
 */
export function countCodePoints(str: string): number {
  return Array.from(str).length;
}

/**
 * Checks if the password length meets Identity's policy: 12 to 128 Unicode code points.
 */
export function validatePasswordLength(password: string): boolean {
  const count = countCodePoints(password);
  return count >= MIN_PASSWORD_CODE_POINTS && count <= MAX_PASSWORD_CODE_POINTS;
}

/**
 * Reads the one-time token from the URL fragment (#token=<token>) and strips it
 * immediately from the address bar using history.replaceState so it never leaks
 * into Referer headers, analytics, or persistent history.
 */
export function extractAndClearToken(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const token = params.get('token');
  if (token) {
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', cleanUrl);
    return token;
  }

  return null;
}
