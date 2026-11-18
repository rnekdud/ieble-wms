// Inspect the rendered canvas instead of the removed object-list accordion.
export async function planObjects(page) {
  await page.locator('.warehouse-plan-canvas canvas').first().waitFor()
  await page.evaluate(()=>import('/tests/fixtures/plan-rotation-probe.ts'))
  return page.evaluate(()=>window.qaKonva.stages.find(s=>s.container().isConnected).find('.plan-object').map(n=>({id:n.id(),text:n.find('Text').map(t=>t.text()).join(' ')})))
}
export async function selectPlanObject(page,id) {
  await planObjects(page)
  // Dispatch the existing canvas object event (also permits overlapped objects).
  await page.evaluate(id=>{const nodes=window.qaKonva.stages.find(s=>s.container().isConnected).find('.plan-object');const node=id==='last'?nodes.at(-1):nodes.find(n=>n.id()===id);if(!node)throw Error('Missing canvas object '+id);node.fire('click',{evt:{shiftKey:false,ctrlKey:false,metaKey:false}},true)},id)
}
export async function waitPlanCount(page,count) {
  await planObjects(page)
  await page.waitForFunction(n=>window.qaKonva.stages.find(s=>s.container().isConnected).find('.plan-object').length===n,count)
}
