export type AddressValue = { postalCode: string; address: string; addressDetail: string }
export type PostcodeResult = { zonecode: string; roadAddress: string; jibunAddress: string; address: string }

export function selectedAddress(result: PostcodeResult, previous: AddressValue): AddressValue {
  const address = result.roadAddress.trim() || result.jibunAddress.trim() || result.address.trim()
  const postalCode = result.zonecode.trim()
  return { postalCode, address, addressDetail: address === previous.address && postalCode === previous.postalCode ? previous.addressDetail : '' }
}

// Older company/warehouse APIs have no postcode column. Store a readable prefix
// in their existing address field; only parse this explicit format, never guess
// or split a pre-existing free-form address.
export function unpackAddress(address: string, detail?: string): AddressValue {
  const detailMatch = /^(.*?)\n상세주소: ([\s\S]*)$/.exec(address)
  const base = detail === undefined && detailMatch ? detailMatch[1] : address
  const match = /^\[(\d{5})\] ([\s\S]+)$/.exec(base)
  return { postalCode: match?.[1] ?? '', address: match?.[2] ?? base, addressDetail: detail ?? detailMatch?.[2] ?? '' }
}
export function packAddress(value: AddressValue, singleField = false): string {
  const base = value.postalCode ? `[${value.postalCode}] ${value.address}` : value.address
  return singleField && value.addressDetail ? `${base}\n상세주소: ${value.addressDetail}` : base
}
