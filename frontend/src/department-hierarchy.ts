import type { OrganizationItem } from './types/organization-structure.ts'

// Presentation only: retain server sibling order for ties and never mutate parent links.
export function departmentHierarchy(items: OrganizationItem[]) {
  const ids=new Set(items.map(item=>item.id)),children=new Map<string|null,OrganizationItem[]>()
  for(const item of [...items].sort((a,b)=>a.sortOrder-b.sortOrder)) {
    const parent=item.parentId&&ids.has(item.parentId)?item.parentId:null
    children.set(parent,[...(children.get(parent)||[]),item])
  }
  const rows:{item:OrganizationItem;depth:number;ancestors:string[]}[]=[],seen=new Set<string>()
  function visit(item:OrganizationItem,ancestors:string[]) {
    if(seen.has(item.id))return
    seen.add(item.id);rows.push({item,depth:ancestors.length,ancestors})
    for(const child of children.get(item.id)||[])visit(child,[...ancestors,item.name])
  }
  for(const root of children.get(null)||[])visit(root,[])
  // Keep malformed historical chains visible without looping or changing their data.
  for(const item of items)visit(item,[])
  return rows
}
