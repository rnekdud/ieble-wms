import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { Employee } from '../../types/organization'
import SearchableChoiceField from './SearchableChoiceField'
import type { Choice } from '../../receipt-model'
import DialogSection from './DialogSection'

type Partner = { id: string; code: string; name: string; businessRegistrationNumber: string | null; companyPhone: string | null; address?: string | null; addressDetail?: string | null; postalCode?: string | null }
type PartnerChoice = Choice & Partner
export default function ExternalCompanyFields({ tenantId, user }: { tenantId: string; user?: Employee }) {
  const [collaborator, setCollaborator] = useState<Choice | undefined>(user?.collaboratorId ? {id:user.collaboratorId,name:user.companyName||'',code:user.collaboratorId.slice(0,8),unit:'',lotManaged:false,expiryManaged:false,serialManaged:false} : undefined)
  const [loading, setLoading] = useState(false)
  const selectedInput = useRef<HTMLInputElement>(null), selectionVersion = useRef(0), mounted = useRef(false)
  useEffect(() => () => { selectionVersion.current++ }, [])
  const [partnerId, setPartnerId] = useState(user?.partnerId || '')
  const [partner, setPartner] = useState<PartnerChoice>()
  const [company, setCompany] = useState(user?.companyName || ''), [number, setNumber] = useState(user?.businessRegistrationNumber || ''), [phone, setPhone] = useState(user?.companyPhone || '')
  const [error, setError] = useState('')
  useEffect(()=>{if(mounted.current) selectedInput.current?.dispatchEvent(new Event('input',{bubbles:true}));else mounted.current=true},[collaborator, company, partnerId])
  const loadPartners = useCallback(async (search: string, page: number) => {
    const result = await api<{ items: Partner[]; total: number; pageSize: number }>(`/api/tenants/${tenantId}/users/partner-options?${new URLSearchParams({ search: search.slice(0, 100), page: String(page) })}`)
    return { ...result, items: result.items.map(p => ({ ...p, unit: null, lotManaged: false, expiryManaged: false, serialManaged: false })) }
  }, [tenantId])
  function selectPartner(item?: Choice) {
    const selected = item as PartnerChoice | undefined
    setPartner(selected); setPartnerId(selected?.id || '')
    setCompany(selected?.name || ''); setNumber(selected?.businessRegistrationNumber || ''); setPhone(selected?.companyPhone || '')
  }
  return <DialogSection title="소속 업체">
    <input ref={selectedInput} type="hidden" name="collaboratorId" value={collaborator?.id||''} />
    <input type="hidden" name="partnerId" value={partnerId} />
    {user && <div className="dialog-span"><SearchableChoiceField floating scrollOptions endpoint={`/api/tenants/${tenantId}/users/collaborators`} kind="collaborators" label="등록된 외부 협력사" value={collaborator?.id||''} current={collaborator} onChange={async item=>{
      const version=++selectionVersion.current
      if(!item){setCollaborator(undefined);selectPartner();setLoading(false);return}
      setLoading(true);setError('')
      try{const group=await api<{partnerId:string|null;name:string;businessRegistrationNumber:string|null;companyPhone:string|null}>(`/api/tenants/${tenantId}/users/collaborators/${item.id}`);if(version===selectionVersion.current){setCollaborator(item);setPartner(undefined);setPartnerId(group.partnerId||'');setCompany(group.name);setNumber(group.businessRegistrationNumber||'');setPhone(group.companyPhone||'')}}catch(e){if(version===selectionVersion.current)setError(e instanceof Error?e.message:'업체를 불러오지 못했습니다.')}finally{if(version===selectionVersion.current)setLoading(false)}
    }}/>{loading&&<p role="status">업체 정보 조회 중…</p>}</div>}
    {error && <p role="alert">{error}</p>}
    {collaborator ? <label>소속 업체명<input name="companyName" disabled={loading} readOnly required maxLength={200} value={company} /></label> : <>
      <input name="companyName" type="hidden" value={company} />
      <SearchableChoiceField floating scrollOptions required disabled={loading} loadPage={loadPartners}
        endpoint={`/api/tenants/${tenantId}/users`} kind="partners" label="소속 업체명"
        placeholder="거래처 검색 또는 새 업체명 입력" searchPlaceholder="거래처 검색 또는 새 업체명 입력"
        emptyMessage="등록된 거래처가 없습니다. 업체명을 입력해 주세요."
        value={partnerId || (company ? 'new-company' : '')}
        current={partner || (company ? { id:partnerId || 'new-company', name:company, code:partnerId ? '' : '신규 외부 업체', unit:null, lotManaged:false, expiryManaged:false, serialManaged:false } : undefined)}
        onChange={selectPartner} onCreate={name => {
          if (partnerId) { setNumber(''); setPhone('') }
          setPartner(undefined); setPartnerId(''); setCompany(name)
        }} />
    </>}
    <label>사업자등록번호 (선택)<input name="businessRegistrationNumber" disabled={loading} readOnly={!!collaborator || !!partnerId} maxLength={64} value={number} onChange={e=>setNumber(e.target.value)} /></label>
    <label>업체 연락처 (선택)<input name="companyPhone" disabled={loading} readOnly={!!collaborator || !!partnerId} type="tel" maxLength={50} value={phone} onChange={e=>setPhone(e.target.value)} /></label>
    {partner && <label>주소<input readOnly value={[partner.postalCode, partner.address, partner.addressDetail].filter(Boolean).join(' ')} /></label>}
    <label>담당자 이메일 (선택)<input name="contactEmail" type="email" maxLength={256} defaultValue={user?.contactEmail || user?.email || ''} /></label>
  </DialogSection>
}
