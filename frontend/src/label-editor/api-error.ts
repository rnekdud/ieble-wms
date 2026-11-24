import { ApiError } from '../api.ts'

export function labelApiError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404 && error.details && typeof error.details === 'object' && !('message' in error.details) && !error.code) {
    return '라벨 템플릿 API 활성화가 필요합니다. 편집과 미리보기는 계속 사용할 수 있습니다.'
  }
  return error instanceof Error ? error.message : '작업을 완료하지 못했습니다.'
}
