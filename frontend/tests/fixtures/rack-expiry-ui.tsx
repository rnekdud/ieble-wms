import { createRoot } from 'react-dom/client'
import DashboardRackDialog from '../../src/components/workspace/DashboardRackDialog'
import type { OverviewRow } from '../../src/stock-overview-model'
import type { RiskProduct } from '../../src/warehouse-risk'
import '../../src/index.css'
import '../../src/components/workspace/products.css'
import '../../src/components/workspace/workspace.css'
import '../../src/components/workspace/warehouse-dashboard.css'
import '../../src/components/workspace/warehouse-risk.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
const product: RiskProduct = { productId:'p',productCode:'P-01',productName:'농심 새우깡 90g',unit:'EA',status:'warning',currentQuantity:100,reservedQuantity:0,expectedQuantity:100,safetyStock:10,shortageQuantity:0,rackQuantity:100,rackReservedQuantity:0,reasons:['오늘 유통기한 만료'],inventoryStatus:'safe',inventoryReasons:[],earliestExpiry:'2026-11-10',reservations:[],moreReservationDates:0 }
const rows: OverviewRow[] = [0,1].map(i=>({productId:'p',productCode:'P-01',productName:product.productName,barcode:null,categoryName:null,warehouseId:'w',warehouseName:'아이블 상온 창고',zoneId:null,zoneName:null,rackId:'r',rackCode:'R-01',locationId:'loc'+i,locationCode:`R-01-L01-B0${i+1}`,locationName:`1단 ${i+1}칸`,lotNumber:'LOT-'+i,expiryDate:i?'2028-10-10':'2026-11-10',serialNumber:null,unit:'EA',quantity:i?90:10,reservedQuantity:0,availableQuantity:i?90:10,globalAvailableQuantity:100,safetyStock:10,safetyComparable:true,isLow:false,isActive:true,hasExpired:false,hasExpiring:!i,statuses:i?['normal']:['expiring']}))
createRoot(document.getElementById('root')!).render(<DashboardRackDialog name="R-01" code="R-01" warehouse="아이블 상온 창고" products={1} status="warning" stock={{items:rows,total:2,page:1,pageSize:20}} risks={[product]} today="2026-11-10" onRefresh={()=>{}} onPage={()=>{}} onClose={()=>{}} />)
