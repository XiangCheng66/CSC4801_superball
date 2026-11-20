import { readStoredLanguage } from '../i18n/languagePreference';
import { messages } from '../i18n/messages';

function errorMessage(key) {
  return messages[readStoredLanguage()][key];
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error', fields = {} } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function readCsrfCookie() {
  const entry = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='));
  return entry ? decodeURIComponent(entry.slice('csrftoken='.length)) : '';
}

// All modules use this client. Sessions stay in HttpOnly cookies, never localStorage.
export function createApiClient({ fetchImpl = globalThis.fetch, getCsrfToken = readCsrfCookie } = {}) {
  async function send(path, options) {
    let response;
    try {
      response = await fetchImpl(path, { ...options, credentials: 'same-origin' });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError(errorMessage('api.offline'));
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(errorMessage('api.invalidResponse'), { status: response.status, code: 'invalid_response' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ApiError(errorMessage('api.invalidResponse'), { status: response.status, code: 'invalid_response' });
    }
    if (!response.ok) {
      throw new ApiError(payload.error?.message || errorMessage('api.requestFailed'), {
        status: response.status,
        code: payload.error?.code || 'request_failed',
        fields: payload.error?.fields || {},
      });
    }
    if (!Object.hasOwn(payload, 'data')) {
      throw new ApiError(errorMessage('api.missingData'), { status: response.status, code: 'invalid_response' });
    }
    return payload.data;
  }

  return async function apiRequest(path, { method = 'GET', body, headers = {}, signal } = {}) {
    if (!path.startsWith('/api/')) {
      throw new ApiError(errorMessage('api.invalidPath'), { code: 'invalid_api_path' });
    }
    const verb = method.toUpperCase();
    const requestHeaders = { Accept: 'application/json', ...headers };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(verb)) {
      let token = getCsrfToken();
      if (!token) {
        const csrf = await send('/api/auth/csrf/', { method: 'GET', headers: { Accept: 'application/json' }, signal });
        token = getCsrfToken() || csrf.csrfToken;
        if (typeof token !== 'string' || !token) {
          throw new ApiError(errorMessage('api.missingCsrf'), { code: 'invalid_response' });
        }
      }
      requestHeaders['X-CSRFToken'] = token;
    }
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    return send(path, {
      method: verb,
      headers: requestHeaders,
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };
}

export const apiRequest = createApiClient();
