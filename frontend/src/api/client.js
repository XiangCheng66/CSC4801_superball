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
      throw new ApiError('无法连接服务，请检查服务是否已启动。');
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError('服务返回了无法识别的响应。', { status: response.status, code: 'invalid_response' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ApiError('服务返回了无法识别的响应。', { status: response.status, code: 'invalid_response' });
    }
    if (!response.ok) {
      throw new ApiError(payload.error?.message || '请求失败，请重试。', {
        status: response.status,
        code: payload.error?.code || 'request_failed',
        fields: payload.error?.fields || {},
      });
    }
    if (!Object.hasOwn(payload, 'data')) {
      throw new ApiError('服务响应缺少 data 字段。', { status: response.status, code: 'invalid_response' });
    }
    return payload.data;
  }

  return async function apiRequest(path, { method = 'GET', body, headers = {}, signal } = {}) {
    if (!path.startsWith('/api/')) {
      throw new ApiError('API 请求必须使用同源 /api/ 路径。', { code: 'invalid_api_path' });
    }
    const verb = method.toUpperCase();
    const requestHeaders = { Accept: 'application/json', ...headers };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(verb)) {
      let token = getCsrfToken();
      if (!token) {
        const csrf = await send('/api/auth/csrf/', { method: 'GET', headers: { Accept: 'application/json' }, signal });
        token = getCsrfToken() || csrf.csrfToken;
        if (typeof token !== 'string' || !token) {
          throw new ApiError('无法获取 CSRF 校验信息。', { code: 'invalid_response' });
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
