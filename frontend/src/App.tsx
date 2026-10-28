
import { useEffect, useState } from 'react'

function App() {
  const [status, setStatus] = useState('연결 확인 중...')

  useEffect(() => {
    fetch('/api/health/db')
      .then((response) => {
        if (!response.ok) {
          throw new Error('API 연결 오류')
        }
        return response.json()
      })
      .then((data) => {
        setStatus(`연결 성공! DB: ${data.database}`)
      })
      .catch(() => {
        setStatus('API 연결 실패')
      })
  }, [])

  return (
    <main style={{ padding: '40px' }}>
      <h1>IEBLE WMS</h1>
      <p>{status}</p>
    </main>
  )
}

export default App
