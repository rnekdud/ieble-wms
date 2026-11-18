/** Screen pixels only; never changes the persisted plan coordinate system. */
export function rackLabelPosition(box:{x:number;y:number;width:number;height:number}, viewport:{width:number;height:number}, label:{width:number;height:number}, topGap=8) {
  const margin=8, gap=8
  if(box.x+box.width<0||box.y+box.height<0||box.x>viewport.width||box.y>viewport.height)return null
  const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(n,Math.max(min,max)))
  const center=box.x+box.width/2
  const x=clamp(center-label.width/2,margin,viewport.width-label.width-margin)
  const above=box.y-topGap-label.height
  const below=above<margin&&box.y+box.height+gap+label.height<=viewport.height-margin
  const y=clamp(below?box.y+box.height+gap:above,margin,viewport.height-label.height-margin)
  return {x,y,below,anchor:clamp(center-x,10,label.width-10)}
}
export type RackLabelInfo={name?:string;code:string;levels:number;bays:number;minimumLevels?:number;minimumBays?:number}
