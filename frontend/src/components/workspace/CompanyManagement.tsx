import { t as uiText } from '../../i18n.ts'
import FormLabel from '../FormLabel'
import { CompanyAddressField } from "../AddressSearchField"
import CompanyLogoEditor from './CompanyLogoEditor'
import type { LogoDraft } from './CompanyLogoEditor'
import { formValues } from '../../form-values'
import { useEffect, useState } from 'react'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import UnsavedChangesDialog from './UnsavedChangesDialog'
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
  logoVersion?: string | null
  version: string
}
type CompanyData = { company: Company }
export default function CompanyManagement({
  tenantId,
  master,
  canUpdate,
  onSaved,
}: {
  tenantId: string
  master: boolean
  canUpdate: boolean
  onSaved: (name: string, logoVersion?: string | null) => void
}) {
  const [data, setData] = useState<CompanyData | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logo, setLogo] = useState<LogoDraft>()
  const [logoReading, setLogoReading] = useState(false)
  const [addressDirty, setAddressDirty] = useState(false)
  const [companyDirty, setCompanyDirty] = useState(false)
  const [numberDirty, setNumberDirty] = useState(false)
  const [formRevision, setFormRevision] = useState(0)
  const navigation = useUnsavedNavigation(companyDirty || addressDirty || numberDirty || !!logo || busy || logoReading, busy || logoReading, () => {
    setLogo(undefined)
    setCompanyDirty(false)
    setAddressDirty(false)
    setNumberDirty(false)
  })
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
    if (!data || logoReading) return
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
        uiText('사업자등록번호를 변경하시겠습니까? 변경 전후 값과 사유가 이력에 기록됩니다.'),
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
        uiText('기업 정보를 저장하시겠습니까? 수정자와 변경 전후 값이 이력에 기록됩니다.'),
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
          ...(!businessNumber && logo ? { logo: { remove: logo.remove, fileName: logo.fileName, contentType: logo.contentType, base64: logo.base64 } } : {}),
          version: data.company.version,
        },
      )
      setData({ ...data, company })
      onSaved(company.name, company.logoVersion)
      setNotice(
        businessNumber
          ? '사업자등록번호와 변경 이력을 저장했습니다.'
          : '기업 정보를 저장했습니다.',
      )
      if (businessNumber) {
        form.reset()
        setNumberDirty(false)
      } else {
        setLogo(undefined)
        setCompanyDirty(false)
        setAddressDirty(false)
        setFormRevision(x => x + 1)
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
        title={uiText("기업 관리")}
      />
      <section className="wms-card organization-card">
        {error && (
          <div className="alert error" role="alert">
            {uiText(error)}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {uiText(notice)}
          </div>
        )}
        {!data ? (<p role="status">
            {error ? uiText("기업 정보를 확인할 수 없습니다.") : uiText("기업 정보를 불러오는 중입니다.")}
          </p>) : (<>
            <form
              key={formRevision}
              onSubmit={(e) => save(e)}
              onChange={e => {
                const values = formValues(e.currentTarget)
                setCompanyDirty((['name', 'representativeName', 'contactName', 'contactPhone'] as const)
                  .some(key => (values[key] || '') !== (data.company[key] || '')))
              }}
            >
              <fieldset disabled={busy || logoReading || !canUpdate}>
                <div className="organization-form-grid">
                  <label><FormLabel required>{uiText("기업명")}</FormLabel><input aria-label={uiText("기업명")}
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={data.company.name}
                      autoComplete="organization"
                    />
                  </label>
                  <label> {uiText("대표자명")} <input
                      name="representativeName"
                      maxLength={200}
                      defaultValue={data.company.representativeName || ''}
                    />
                  </label>
                  <label> {uiText("담당자명")} <input
                      name="contactName"
                      maxLength={200}
                      defaultValue={data.company.contactName || ''}
                    />
                  </label>
                  <label> {uiText("연락처")} <input
                      name="contactPhone"
                      type="tel"
                      maxLength={30}
                      pattern="\+?[0-9][0-9 \(\)\-]{5,28}[0-9]"
                      defaultValue={data.company.contactPhone || ''}
                    />
                  </label>
                </div>
                <CompanyAddressField initial={data.company.address || ''} disabled={busy || logoReading || !canUpdate} onDirty={setAddressDirty} />
                <CompanyLogoEditor source={data.company.logoVersion ? `${endpoint}/logo?v=${data.company.logoVersion}` : undefined} draft={logo} onChange={canUpdate ? setLogo : undefined} busy={busy} onReading={setLogoReading} />
                {canUpdate && (
                  <button className="primary" type="submit">
                    {busy ? uiText("저장 중…") : uiText("기업 정보 저장")}
                  </button>
                )}
              </fieldset>
            </form>
            {!canUpdate && (
              <p className="organization-help"> {uiText("기업 정보 조회 권한만 있습니다. 수정 권한은 기업 마스터에게 문의해 주세요.")} </p>
            )}
            <section
              className="organization-section"
              aria-labelledby="business-number-heading"
            >
              <h2 id="business-number-heading">{uiText("사업자등록번호")}</h2>
              <p>
                <strong>
                  {data.company.businessRegistrationNumber || uiText("미등록")}
                </strong>
              </p>
              {master ? (
                <form onSubmit={(e) => save(e, true)}
                  onChange={e => setNumberDirty(Object.values(formValues(e.currentTarget)).some(value => value !== ''))}>
                  <fieldset disabled={busy}>
                    <label><FormLabel required>{uiText("새 사업자등록번호")}</FormLabel><input aria-label={uiText("새 사업자등록번호")}
                        name="businessRegistrationNumber"
                        required
                        maxLength={64}
                        inputMode="numeric"
                        placeholder="000-00-00000"
                      />
                    </label>
                    <label><FormLabel required>{uiText("변경 사유")}</FormLabel><input aria-label={uiText("변경 사유")} name="reason" required maxLength={500} />
                    </label>
                    <button className="secondary" type="submit"> {uiText("사업자등록번호 변경")} </button>
                  </fieldset>
                </form>
              ) : (
                <p className="organization-help"> {uiText("기업 식별에 사용되는 번호로, 기업 마스터만 별도로 변경할 수 있습니다.")} </p>
              )}
            </section>

          </>)}

      </section>
      <UnsavedChangesDialog guard={navigation} />
    </>
  )
}
