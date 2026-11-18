import './contact-info.css'

export default function ContactLink({ value, email = false }: { value?: string | null; email?: boolean }) {
  if (!value) return <>-</>
  const phone = value.replace(/[^0-9+]/g, '')
  return <a className="contact-info-link" title={value} href={email ? `mailto:${value}` : `tel:${phone}`}>{value}</a>
}
