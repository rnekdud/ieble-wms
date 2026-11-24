import { getLocale } from '../i18n.ts'
import { t as uiText } from '../i18n.ts'
import { useState } from 'react'
import { api } from '../api'

export default function TenantAccess({
  tenantId,
  free,
  firstChargeAt,
  timeZone,
}: {
  tenantId: string
  free: boolean
  firstChargeAt: string
  timeZone: string
}) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function enter() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api<{ message: string }>(
        `/api/tenants/${tenantId}/dashboard`,
      )
      setMessage(result.message)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '업무 접근 상태를 확인하지 못했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="work-entry">
      <h3>{free ? uiText("가입 월 무료 이용 중") : uiText("결제 완료")}</h3>
      <p>
        {free ? uiText("카드 등록이 확인되어 가입한 달은 무료로 이용할 수 있습니다. 첫 결제 예정일은 {v0}입니다.", { v0: new Date(firstChargeAt).toLocaleDateString(getLocale(), { timeZone }) }) : uiText("카드 등록 및 결제가 확인되었습니다.")}{' '} {uiText("업무 진입 시 서버에서 현재 이용 권한을 다시 확인합니다.")} </p>
      <button className="primary" onClick={enter} disabled={busy}>
        {busy ? uiText("확인 중…") : uiText("WMS 업무 시작")}
      </button>
      {error && (
        <div className="alert error" role="alert">
          {uiText(error)}
        </div>
      )}
      {message && (
        <div className="alert success" role="status">
          {uiText(message)} {uiText("물류 업무 기능은 순차적으로 제공됩니다.")} </div>
      )}
    </div>
  )
}
