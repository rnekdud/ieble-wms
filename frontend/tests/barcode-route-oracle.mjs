// Used by the isolated .NET parity test; evaluates the real browser path implementation.
import {barcodeRackRoutes} from '../src/barcode-route.ts'
let input='';for await(const chunk of process.stdin)input+=chunk
const {plan,ids}=JSON.parse(input)
process.stdout.write(JSON.stringify(Object.fromEntries(barcodeRackRoutes(plan,ids))))
