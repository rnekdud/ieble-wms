import { t as uiText, getLocale } from '../../i18n.ts'
type Access = { state: string; developmentTest?: { startsAt: string; endsAt: string } }
export default function DevelopmentAccessNotice({ access }: { access: Access }) {
  // This field is emitted only by the Development server for an active tenant-specific grant.
  if (access.state !== 'DevelopmentTest' || !access.developmentTest) return null
  const date = (value: string) => new Date(value).toLocaleString(getLocale(), { timeZone: 'Asia/Seoul', hour12: false })
  return <section className="alert development-notice" role="status" aria-label={uiText("개발 테스트 이용 안내")}>
    <strong>{uiText("개발 테스트 이용 중")}</strong>
    <span>{uiText("이용 종료")} {date(access.developmentTest.endsAt)} KST</span>
    <details><summary>{uiText("이용 안내")}</summary>
    <p>{date(access.developmentTest.startsAt)}{uiText("부터 로컬 개발환경에서만 허용됩니다. 실제 결제·카드 등록·무료 이용 기간은 변경되지 않았습니다.")}</p></details>
  </section>
}
