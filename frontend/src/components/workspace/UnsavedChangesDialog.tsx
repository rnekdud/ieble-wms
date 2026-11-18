import type { useUnsavedNavigation } from '../../use-unsaved-navigation'
import OrganizationDialog from './OrganizationDialog'
import UnsavedChangesContent from './UnsavedChangesContent'

export default function UnsavedChangesDialog({ guard }: { guard: ReturnType<typeof useUnsavedNavigation> }) {
  return guard.blocked && <OrganizationDialog confirmation size="small" title="저장하지 않은 변경사항" onClose={guard.stay}>
    <UnsavedChangesContent stay={guard.stay} discard={guard.discard} />
  </OrganizationDialog>
}
