import type { components, operations } from '../../generated/identity';

// Typed client for the admin identity API (contracts/openapi/identity.yaml).
// The session lives only in the HttpOnly __Host-session cookie set by the API;
// nothing is stored in browser storage, and every call bypasses the HTTP cache.

export type AdminUser = components['schemas']['AdminUser'];
export type AdminUserPage = components['schemas']['AdminUserPage'];
export type AdminRole = components['schemas']['AdminRole'];
export type LoginProgress = components['schemas']['LoginProgress'];
export type TotpEnrollment = components['schemas']['TOTPEnrollment'];
export type EnrollmentCompleted = components['schemas']['EnrollmentCompleted'];
export type RecoveryCodes = components['schemas']['RecoveryCodes'];
export type ResetAcknowledgement = components['schemas']['ResetAcknowledgement'];
export type ActionCompleted = components['schemas']['ActionCompleted'];
export type SecondFactorProof = components['schemas']['SecondFactorProof'];
export type PasswordChangeRequest = components['schemas']['PasswordChangeRequest'];
export type ReauthenticationRequest = components['schemas']['ReauthenticationRequest'];
export type CreateAdminUserRequest = components['schemas']['CreateAdminUserRequest'];
export type UpdateAdminUserRequest = components['schemas']['UpdateAdminUserRequest'];
export type Problem = NonNullable<
  operations['loginAdmin']['responses'][401]['content']
>['application/problem+json'];

export type AdminResult<T> =
  | { ok: true; data: T; etag: string | null }
  | { ok: false; code: string; status: number; problem?: Problem; retryAfterSeconds?: number };

const ACCEPT = 'application/json, application/problem+json';

export interface RequestOptions {
  body?: unknown;
  ifMatch?: string;
  /** Media type of a JSON body; defaults to application/json (merge patches use their own). */
  contentType?: string;
  /** Multipart body; the browser sets the Content-Type with its boundary. */
  formData?: FormData;
}

/** Builds a query string from defined values; arrays repeat the parameter. */
export function queryString(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
    else query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: RequestOptions = {}
): Promise<AdminResult<T>> {
  const headers: Record<string, string> = { Accept: ACCEPT };
  if (options.body !== undefined) headers['Content-Type'] = options.contentType ?? 'application/json';
  if (options.ifMatch !== undefined) headers['If-Match'] = options.ifMatch;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'network_error', status: 0 };
  }

  if (response.ok) {
    const data = response.status === 204 ? null : ((await response.json()) as T);
    return { ok: true, data: data as T, etag: response.headers.get('ETag') };
  }

  let problem: Problem | undefined;
  try {
    problem = (await response.json()) as Problem;
  } catch {
    problem = undefined;
  }
  const code = problem && typeof problem.code === 'string' ? problem.code : `http_${response.status}`;
  const retryAfter = Number(response.headers.get('Retry-After'));
  return {
    ok: false,
    code,
    status: response.status,
    problem,
    ...(Number.isInteger(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
  };
}

const userPath = (id: string) => `/api/v1/admin/users/${encodeURIComponent(id)}`;

/** Verifies email and password; starts a restricted pending session. */
export function login(email: string, password: string) {
  return request<LoginProgress>('POST', '/api/v1/admin/sessions', { body: { email, password } });
}

/** Completes a pending login with a TOTP code or a recovery code. */
export function verifySecondFactor(proof: SecondFactorProof) {
  return request<AdminUser>('POST', '/api/v1/admin/sessions/verify', { body: proof });
}

/** Reads the fully authenticated administrator; 401 for absent or pending sessions. */
export function getCurrentAdmin() {
  return request<AdminUser>('GET', '/api/v1/admin/sessions/current');
}

/** Destroys the current full or pending session. */
export function logout() {
  return request<null>('DELETE', '/api/v1/admin/sessions/current');
}

/** Obtains the pending administrator's TOTP enrollment secret and otpauth URI. */
export function enrollTotp() {
  return request<TotpEnrollment>('POST', '/api/v1/admin/totp/enroll');
}

/** Confirms enrollment with the first valid six-digit code; returns recovery codes once. */
export function confirmTotp(totpCode: string) {
  return request<EnrollmentCompleted>('POST', '/api/v1/admin/totp/confirm', {
    body: { totp_code: totpCode },
  });
}

/** Requests a reset link; the response never reveals whether the email exists. */
export function requestPasswordReset(email: string) {
  return request<ResetAcknowledgement>('POST', '/api/v1/admin/password-resets', { body: { email } });
}

/** Consumes a reset or invitation token to set a new password. */
export function completePasswordReset(token: string, newPassword: string) {
  return request<ActionCompleted>('POST', '/api/v1/admin/password-resets/complete', {
    body: { token, new_password: newPassword },
  });
}

/** Changes one's own password with the current password and a second factor. */
export function changePassword(body: PasswordChangeRequest) {
  return request<ActionCompleted>('POST', '/api/v1/admin/password/change', { body });
}

/** Replaces one's own recovery codes after reauthentication; returns them once. */
export function regenerateRecoveryCodes(body: ReauthenticationRequest) {
  return request<RecoveryCodes>('POST', '/api/v1/admin/recovery-codes/regenerate', { body });
}

/** Lists administrators (owner only) with cursor pagination. */
export function listAdminUsers(params: { limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor !== undefined) query.set('cursor', params.cursor);
  const suffix = query.toString();
  return request<AdminUserPage>('GET', `/api/v1/admin/users${suffix ? `?${suffix}` : ''}`);
}

/** Creates an administrator and enqueues an emailed invitation (owner only). */
export function createAdminUser(body: CreateAdminUserRequest) {
  return request<AdminUser>('POST', '/api/v1/admin/users', { body });
}

/** Reads an administrator and its ETag version (owner only). */
export function getAdminUser(id: string) {
  return request<AdminUser>('GET', userPath(id));
}

/** Updates an administrator; `etag` must be the exact ETag from the last read. */
export function updateAdminUser(id: string, etag: string, body: UpdateAdminUserRequest) {
  return request<AdminUser>('PATCH', userPath(id), { body, ifMatch: etag });
}

/** Resets another administrator's 2FA after owner reauthentication; `etag` must be exact. */
export function resetAdminUserTotp(id: string, etag: string, body: ReauthenticationRequest) {
  return request<AdminUser>('POST', `${userPath(id)}/totp/reset`, { body, ifMatch: etag });
}
