import { t as uiText } from '../../i18n.ts'
import FormLabel from '../FormLabel'
import SearchableChoiceField from './SearchableChoiceField'
import { useCallback, useState } from 'react'
import { api } from '../../api'
import { categoryPath } from '../../product-model'
import type { ProductCategory, ProductOptions, ProductType } from '../../product-model'

export default function ProductClassification({ endpoint, options, onOptions, categoryId, productTypeId, onCategory, onType, onEditing }: {
  endpoint: string; options: ProductOptions; onOptions: (value: ProductOptions) => void
  categoryId: string; productTypeId: string; onCategory: (id: string) => void; onType: (id: string) => void; onEditing: (editing: boolean) => void
}) {
  const [manager, setManager] = useState<'categories' | 'types' | null>(null)
  const [id, setId] = useState(''), [name, setName] = useState(''), [parentId, setParentId] = useState(''), [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const path = categoryPath(categoryId, options.categories), items = (manager === 'categories' ? options.categories : options.productTypes || []).filter(x => !x.isSystem)
  function open(kind: 'categories' | 'types') { setManager(kind); setId(''); setName(''); setParentId(''); setActive(true); setError(''); onEditing(true) }
  function select(value: string) { const item = items.find(x => x.id === value); setId(value); setName(item?.name || ''); setParentId(item && 'parentId' in item ? (item as ProductCategory).parentId || '' : ''); setActive(item?.isActive ?? true) }
  async function save() {
    if (busy || !name.trim() || !manager) return
    setBusy(true); setError('')
    try {
      const value = await api<ProductCategory | ProductType>(`${endpoint}/${manager}${id ? `/${id}` : ''}`, { name, parentId: manager === 'categories' ? parentId || null : null, isActive: active, version: items.find(x => x.id === id)?.version || '00000000-0000-0000-0000-000000000000' })
      const next = await api<ProductOptions>(endpoint + '/options'); onOptions(next)
      if (!id && value.isActive) { if (manager === 'categories') onCategory(value.id); else onType(value.id) }
      setManager(null); onEditing(false)
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.') } finally { setBusy(false) }
  }
  return <div className="products-full product-classification">
    <div className="product-field-grid">{[0, 1, 2].map(level => {
      const parent = level ? path[level - 1]?.id : null
      const choices = (level > 0 && !parent ? [] : options.categories).filter(c => (c.parentId || null) === (parent || null) && (c.isActive || path[level]?.id === c.id))
      return <ClassificationChoice key={`${level}:${parent || ''}`} label={uiText("{v0}차 카테고리", { v0: level + 1 })} disabled={level > 0 && !parent} items={choices} value={path[level]?.id || ''} onChange={id => onCategory(id || parent || '')} />
    })}<ClassificationChoice label={uiText("상품 구분")} items={(options.productTypes || []).filter(t => t.isActive || t.id === productTypeId)} value={productTypeId} onChange={onType} /></div>
    <div className="product-inline-actions"><button type="button" className="secondary" onClick={() => open('categories')}>{uiText("카테고리 추가·관리")}</button><button type="button" className="secondary" onClick={() => open('types')}>{uiText("상품 구분 추가·관리")}</button></div>
    {manager && <section className="product-classification-editor" aria-label={uiText("분류 관리")}><h4>{manager === 'categories' ? uiText("카테고리") : uiText("상품 구분")} {uiText("관리")}</h4><p className="organization-help">{uiText("기업 전용 항목은 즉시 저장됩니다. 기본 제공 항목은 공통 기준이므로 수정할 수 없습니다.")}</p><fieldset disabled={busy} className="product-field-grid"><label>{uiText("수정할 항목")}<select aria-label={uiText("수정할 항목")} value={id} onChange={e => select(e.target.value)}><option value="">{uiText("새로 추가")}</option>{items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><FormLabel required>{uiText("이름")}</FormLabel><input aria-required="true" aria-label={uiText("분류 이름")} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>{manager === 'categories' && <label>{uiText("상위 카테고리")}<select aria-label={uiText("상위 카테고리")} value={parentId} onChange={e => setParentId(e.target.value)}><option value="">{uiText("없음 (1차)")}</option>{options.categories.filter(c => c.isActive && c.id !== id && categoryPath(c.id, options.categories).length < 3).map(c => <option key={c.id} value={c.id}>{categoryPath(c.id, options.categories).map(x => x.name).join(' › ')}</option>)}</select></label>}<label className="products-checks"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />{uiText("사용")}</label></fieldset>{manager === 'types' && !id && <p className="organization-help">{uiText("기본 구분에 없는 기업 전용 유형을 추가하세요. 예: 연구용 자재 · 대여품")}</p>}{error && <p role="alert" className="alert error">{uiText(error)}</p>}<div className="product-inline-actions"><button type="button" className="secondary dialog-close" disabled={busy} onClick={() => { setManager(null); onEditing(false) }}>{uiText("닫기")}</button><button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{uiText("분류 저장")}</button></div></section>}
  </div>
}

function ClassificationChoice({ label, items, value, disabled, onChange }: {
  label: string; items: ProductType[]; value: string; disabled?: boolean; onChange: (id: string) => void
}) {
  const choice = (item: ProductType) => ({ id: item.id, name: item.name + (!item.isActive ? ' (사용 중지)' : ''), code: item.isSystem ? '기본 제공' : '기업 전용', unit: null, lotManaged: false, expiryManaged: false, serialManaged: false })
  const loadPage = useCallback(async (search: string, page: number) => {
    const found = items.filter(x => x.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    return { items: found.slice((page - 1) * 30, page * 30).map(choice), total: found.length, pageSize: 30 }
  }, [items])
  const selected = items.find(x => x.id === value)
  return <SearchableChoiceField endpoint="" kind="classification" label={label} value={value} current={selected ? choice(selected) : undefined} disabled={disabled} loadPage={loadPage} placeholder={uiText("선택 안 함")} searchPlaceholder={uiText("{v0} 검색", { v0: uiText(label) })} onChange={item => onChange(item?.id || '')} />
}
