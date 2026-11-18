import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AddressSearchField from '../../src/components/AddressSearchField'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
export function Fixture() {
  const [value, setValue] = useState({ postalCode: '', address: '', addressDetail: '이전 상세' })
  return <main className="wms-layout" style={{ display: 'block', padding: 16 }}><AddressSearchField value={value} onChange={setValue} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
