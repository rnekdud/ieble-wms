import { setLanguage } from '../i18n.ts'
import { useLanguage } from '../use-language'
import './language-select.css'
export default function LanguageSelect() {
  const language = useLanguage()
  return <label className="wms-language"><select aria-label={language === 'ko' ? '언어 선택' : 'Language'} value={language} onChange={e => setLanguage(e.target.value === 'en' ? 'en' : 'ko')}><option value="ko" lang="ko">한국어</option><option value="en" lang="en">English</option></select></label>
}
