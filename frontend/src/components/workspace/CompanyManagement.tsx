import { formValues } from '../../form-values'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api'
import {
  validBusinessNumber,
  normalizeBusinessNumber,
} from '../../registration-validation'
import { PageHeading } from './WorkspaceUI'

type Company = {
  id: string
  name: string
  representativeName: string | null
  businessRegistrationNumber: string | null
  address: string | null
  contactName: string | null
  contactPhone: string | null
  version: string
}
type History = {
  id: number
  action: string
  changedByName: string
  changedByUserId: string
  changedAt: string
  beforeJson: string
  afterJson: string
  reason: string | null
}
type CompanyData = { company: Company; history: History[] }
const companyFields: Record<string, string> = {
  Name: '기업명',
  RepresentativeName: '대표자명',
  BusinessRegistrationNumber: '사업자등록번호',
  Address: '주소',
  ContactName: '담당자명',
  ContactPhone: '연락처',
}
function historyChanges(row: History) {
  try {
    const before = JSON.parse(row.beforeJson),
      after = JSON.parse(row.afterJson)
    return Object.entries(companyFields)
      .filter(([key]) => before[key] !== after[key])
      .map(([key, label]) => ({
        label,
        before:
          typeof before[key] === 'string' && before[key]
            ? before[key]
            : '미등록',
        after:
          typeof after[key] === 'string' && after[key] ? after[key] : '미등록',
      }))
  } catch {
    return [{ label: '변경 내용', before: '확인 필요', after: '확인 필요' }]
  }
}
export default function CompanyManagement({
  tenantId,
  master,
  canUpdate,
  onSaved,
}: {
  tenantId: string
  master: boolean
  canUpdate: boolean
  onSaved: (name: string) => void
}) {
  const [data, setData] = useState<CompanyData | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const endpoint = `/api/tenants/${tenantId}/company`
  useEffect(() => {
    let live = true
    api<CompanyData>(endpoint)
      .then((result) => {
        if (live) {
          setData(result)
          setError('')
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : '기업 정보를 불러오지 못했습니다.',
          )
      })
    return () => {
      live = false
    }
  }, [endpoint, revision])
  async function save(
    event: FormEvent<HTMLFormElement>,
    businessNumber = false,
  ) {
    event.preventDefault()
    if (!data) return
    const form = event.currentTarget
    const values = formValues(form)
    if (
      businessNumber &&
      (!validBusinessNumber(String(values.businessRegistrationNumber)) ||
        !String(values.reason).trim())
    ) {
      setError('사업자등록번호 10자리와 변경 사유를 확인해 주세요.')
      return
    }
    if (
      businessNumber &&
      !window.confirm(
        '사업자등록번호를 변경하시겠습니까? 변경 전후 값과 사유가 이력에 기록됩니다.',
      )
    )
      return
    if (!businessNumber && !String(values.name).trim()) {
      setError('기업명을 입력해 주세요.')
      return
    }
    if (
      !businessNumber &&
      !window.confirm(
        '기업 정보를 저장하시겠습니까? 수정자와 변경 전후 값이 이력에 기록됩니다.',
      )
    )
      return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const company = await api<Company>(
        endpoint + (businessNumber ? '/business-number' : ''),
        {
          ...values,
          ...(businessNumber
            ? {
                businessRegistrationNumber: normalizeBusinessNumber(
                  String(values.businessRegistrationNumber),
                ),
              }
            : {}),
          version: data.company.version,
        },
      )
      setData({ ...data, company })
      onSaved(company.name)
      setNotice(
        businessNumber
          ? '사업자등록번호와 변경 이력을 저장했습니다.'
          : '기업 정보를 저장했습니다.',
      )
      if (businessNumber) {
        form.reset()
      }
      setRevision((x) => x + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeading
        title="기업 관리"
        description="현재 소속 기업의 정보를 확인하고 관리하세요."
      />
      <section className="wms-card organization-card">
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        {!data ? (
          <p role="status">
            {error
              ? '기업 정보를 확인할 수 없습니다.'
              : '기업 정보를 불러오는 중입니다.'}
          </p>
        ) : (
          <>
            <form
              key={`${data.company.version}:${revision}`}
              onSubmit={(e) => save(e)}
            >
              <fieldset disabled={busy || !canUpdate}>
                <div className="organization-form-grid">
                  <label>
                    기업명
                    <input
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={data.company.name}
                      autoComplete="organization"
                    />
                  </label>
                  <label>
                    대표자명
                    <input
                      name="representativeName"
                      maxLength={200}
                      defaultValue={data.company.representativeName || ''}
                    />
                  </label>
                  <label>
                    담당자명
                    <input
                      name="contactName"
                      maxLength={200}
                      defaultValue={data.company.contactName || ''}
                    />
                  </label>
                  <label>
                    연락처
                    <input
                      name="contactPhone"
                      type="tel"
                      maxLength={30}
                      pattern="\+?[0-9][0-9 \(\)\-]{5,28}[0-9]"
                      defaultValue={data.company.contactPhone || ''}
                    />
                  </label>
                </div>
                <label>
                  주소
                  <input
                    name="address"
                    maxLength={500}
                    defaultValue={data.company.address || ''}
                    autoComplete="street-address"
                  />
                </label>
                {canUpdate && (
                  <button className="primary" type="submit">
                    {busy ? '저장 중…' : '기업 정보 저장'}
                  </button>
                )}
              </fieldset>
            </form>
            {!canUpdate && (
              <p className="organization-help">
                기업 정보 조회 권한만 있습니다. 수정 권한은 기업 마스터에게
                문의해 주세요.
              </p>
            )}
            <section
              className="organization-section"
              aria-labelledby="business-number-heading"
            >
              <h2 id="business-number-heading">사업자등록번호</h2>
              <p>
                <strong>
                  {data.company.businessRegistrationNumber || '미등록'}
                </strong>
              </p>
              {master ? (
                <form onSubmit={(e) => save(e, true)}>
                  <fieldset disabled={busy}>
                    <label>
                      새 사업자등록번호
                      <input
                        name="businessRegistrationNumber"
                        required
                        maxLength={64}
                        inputMode="numeric"
                        placeholder="000-00-00000"
                      />
                    </label>
                    <label>
                      변경 사유
                      <input name="reason" required maxLength={500} />
                    </label>
                    <button className="secondary" type="submit">
                      사업자등록번호 변경
                    </button>
                  </fieldset>
                </form>
              ) : (
                <p className="organization-help">
                  기업 식별에 사용되는 번호로, 기업 마스터만 별도로 변경할 수
                  있습니다.
                </p>
              )}
            </section>
            <section
              className="organization-section"
              aria-labelledby="company-history-heading"
            >
              <h2 id="company-history-heading">기업 정보 변경 이력</h2>
              {!data.history?.length ? (
                <p className="organization-help">아직 변경 이력이 없습니다.</p>
              ) : (
                <div className="wms-table-scroll">
                  <table className="wms-table organization-history">
                    <caption>최근 기업 정보 변경 이력 (최대 20건)</caption>
                    <thead>
                      <tr>
                        <th>수정일</th>
                        <th>수정자</th>
                        <th>변경 내용</th>
                        <th>사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {new Date(row.changedAt).toLocaleString('ko-KR')}
                          </td>
                          <td>{row.changedByName}</td>
                          <td>
                            {historyChanges(row).map((change) => (
                              <div key={change.label}>
                                <strong>{change.label}</strong>: {change.before}{' '}
                                → {change.after}
                              </div>
                            ))}
                          </td>
                          <td>{row.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            if (
              !data ||
              window.confirm(
                '저장하지 않은 입력을 버리고 최신 정보를 불러오시겠습니까?',
              )
            )
              setRevision((x) => x + 1)
          }}
        >
          기업 정보 다시 불러오기
        </button>
      </section>
    </>
  )
}
