import SearchableChoiceField from './SearchableChoiceField'
import type { ChoiceFieldProps } from './SearchableChoiceField'

// Retain the old prop for existing callers; every business picker now searches inside its dropdown.
export default function ChoiceField(props: ChoiceFieldProps & { searchable?: boolean }) {
  return <SearchableChoiceField floating {...props} />
}
