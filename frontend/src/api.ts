export type Membership = {
  tenantId: string
  name: string
  role: string
  serviceStatus: string
}
export type Session = {
  user: { id: string; displayName: string; email: string; systemRole: string; userName: string; mustChangePassword: boolean }
  memberships: Membership[]
  tenantResolution: 'resolved' | 'default_required' | 'no_membership'
  selectedTenantId: string | null
}
export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    let response: Response
    try {
      response = await fetch('/api/auth/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
    } catch {
      throw new ApiError(
        0,
        '인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        response.status === 404 || response.status >= 500
          ? '인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : '보안 연결을 확인하지 못했습니다. 다시 시도해 주세요.',
      )
    const data: unknown = await response.json().catch(() => null)
    if (
      !data ||
      typeof data !== 'object' ||
      !('token' in data) ||
      typeof data.token !== 'string' ||
      !data.token.trim()
    )
      throw new ApiError(
        502,
        '인증 서비스 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    const token = data.token
    headers['X-CSRF-TOKEN'] = token
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const message =
      data.message ||
      (response.status === 401
        ? '로그인이 필요하거나 세션이 만료되었습니다.'
        : response.status === 403
          ? '이 화면에 접근할 권한이 없습니다.'
          : response.status === 429
            ? '요청이 많습니다. 1분 후 다시 시도해 주세요.'
            : response.status === 400
              ? '입력 형식 또는 보안 토큰을 확인해 주세요. 다시 시도해 주세요.'
              : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    throw new ApiError(response.status, message, data.code)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}
