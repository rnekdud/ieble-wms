import { createRoot } from 'react-dom/client'
import CompanyLogoEditor from '../../src/components/workspace/CompanyLogoEditor'
import ProductImageGallery from '../../src/components/workspace/ProductImageGallery'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'

const preview = '/wms_logo.svg'
const readonly = new URLSearchParams(location.search).has('readonly')
createRoot(document.getElementById('root')!).render(<main className="wms-content" style={{ margin: 0, padding: 16 }}>
  <CompanyLogoEditor source={preview} busy={false} onReading={() => {}} onChange={readonly ? undefined : () => {}} />
  <ProductImageGallery images={[{ key: 'reference', fileName: 'reference.png', contentType: 'image/png', preview, isPrimary: false }]} endpoint="/unused" onChange={readonly ? undefined : () => {}} />
</main>)
