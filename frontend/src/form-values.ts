export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {}
  new FormData(form).forEach((value, key) => {
    values[key] = String(value)
  })
  return values
}
