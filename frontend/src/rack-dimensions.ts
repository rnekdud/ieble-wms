export type RackDimensions = {levels:number;bays:number;minimumLevels?:number;minimumBays?:number}
export type RackDimensionKey = 'levels'|'bays'
/** Shared by both inputs. Invalid text is never a warehouse draft value. */
export function rackDimensionChange(rack:RackDimensions,key:RackDimensionKey,raw:string):{error:string;patch?:Partial<Pick<RackDimensions,RackDimensionKey>>} {
 const minimum=Math.max(1,(key==='levels'?rack.minimumLevels:rack.minimumBays)||1)
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))return {error:'1 이상의 정수를 입력해 주세요. 잘못된 값은 반영하지 않습니다.'}
 const value=Number(raw)
 if(value<minimum||value>100)return {error:minimum>1?`기존 위치 보호를 위해 ${minimum}~100 범위로 입력해 주세요.`:'1~100 범위로 입력해 주세요.'}
 if(value*(key==='levels'?rack.bays:rack.levels)>1000)return {error:'랙의 보관 위치는 최대 1,000개입니다.'}
 return {error:'',patch:{[key]:value}}
}
