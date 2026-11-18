import type { ReactNode } from 'react'
import './storage-tree.css'

// Shared by the editor and the read-only warehouse plan.
export default function StorageTreeNode({name,code,kind,selected,expanded,onExpanded,onSelect,summary,actions,children}: {
  name:string;code:string;kind:'zone'|'rack'|'location';selected:boolean;expanded?:boolean;
  onExpanded?:(open:boolean)=>void;onSelect:()=>void;summary?:ReactNode;actions?:ReactNode;children?:ReactNode
}) {
  const heading=<span className="workspace-tree-heading"><button type="button" className="text-button" aria-pressed={selected} onClick={e=>{e.preventDefault();onSelect()}}><strong>{name}</strong>{name!==code&&<small>{code}</small>}</button><small>{summary}</small>{actions}</span>
  return kind==='location'?<div className={`workspace-structure-row ${selected?'is-selected':''}`}>{heading}</div>:<details className={`workspace-tree-node workspace-${kind}-node ${selected?'is-selected':''}`} open={expanded} onToggle={e=>onExpanded?.(e.currentTarget.open)}><summary>{heading}</summary>{children}</details>
}
