import { createContext, useContext } from 'react'
export type BusinessAssignee = { id: string; name: string; code: string; email?: string | null; customCode?: string | null }
export const BusinessAssigneeContext = createContext<{ tenantId?: string; current?: BusinessAssignee | null }>({})
export function useCurrentAssignee() { return useContext(BusinessAssigneeContext).current }
