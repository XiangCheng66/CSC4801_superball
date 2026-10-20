import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

describe('shared API contract', () => {
  it('unwraps data and sends same-origin session cookies', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: { id: 7 } }));
    const request = createApiClient({ fetchImpl });
    expect(await request('/api/auth/me/')).toEqual({ id: 7 });
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/me/', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
  });

  it('obtains CSRF before unsafe requests and sends JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: { csrfToken: 'fresh-token' } })).mockResolvedValueOnce(response({ data: { id: 1 } }, 201));
    const request = createApiClient({ fetchImpl, getCsrfToken: () => '' });
    await request('/api/auth/register/', { method: 'POST', body: { username: 'alice' } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/auth/csrf/');
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'POST', headers: { 'X-CSRFToken': 'fresh-token', 'Content-Type': 'application/json' }, body: '{"username":"alice"}' });
  });

  it('reads the current CSRF cookie for every mutation', async () => {
    const token = vi.fn().mockReturnValueOnce('old').mockReturnValueOnce('rotated');
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: {} }));
    const request = createApiClient({ fetchImpl, getCsrfToken: token });
    await request('/api/auth/login/', { method: 'POST', body: {} });
    await request('/api/auth/logout/', { method: 'POST' });
    expect(fetchImpl.mock.calls[0][1].headers['X-CSRFToken']).toBe('old');
    expect(fetchImpl.mock.calls[1][1].headers['X-CSRFToken']).toBe('rotated');
  });

  it('preserves HTTP status, error code and field validation', async () => {
    const request = createApiClient({ fetchImpl: vi.fn().mockResolvedValue(response({ error: { code: 'validation_error', message: 'Check fields', fields: { email: ['Invalid'] } } }, 400)) });
    await expect(request('/api/auth/me/')).rejects.toMatchObject({ name: 'ApiError', status: 400, code: 'validation_error', fields: { email: ['Invalid'] } });
  });

  it('does not retry a failed mutation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ error: { code: 'account_conflict', message: 'Already exists' } }, 409));
    const request = createApiClient({ fetchImpl, getCsrfToken: () => 'token' });
    await expect(request('/api/auth/register/', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 409 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects remote URLs before sending cookies or CSRF', async () => {
    const fetchImpl = vi.fn();
    const request = createApiClient({ fetchImpl });
    await expect(request('https://elsewhere.test/api/')).rejects.toMatchObject({ code: 'invalid_api_path' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports network and invalid response errors and preserves aborts', async () => {
    const network = createApiClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')) });
    await expect(network('/api/auth/me/')).rejects.toBeInstanceOf(ApiError);
    const invalid = createApiClient({ fetchImpl: vi.fn().mockResolvedValue({ status: 502, json: async () => { throw new Error(); } }) });
    await expect(invalid('/api/auth/me/')).rejects.toMatchObject({ status: 502, code: 'invalid_response' });
    const empty = createApiClient({ fetchImpl: vi.fn().mockResolvedValue(response(null)) });
    await expect(empty('/api/auth/me/')).rejects.toMatchObject({ code: 'invalid_response' });
    const aborted = new DOMException('Aborted', 'AbortError');
    const cancelled = createApiClient({ fetchImpl: vi.fn().mockRejectedValue(aborted) });
    await expect(cancelled('/api/auth/me/')).rejects.toBe(aborted);
  });

  it('stops before mutation if CSRF initialization returns no token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: {} }));
    const request = createApiClient({ fetchImpl, getCsrfToken: () => '' });
    await expect(request('/api/auth/login/', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
