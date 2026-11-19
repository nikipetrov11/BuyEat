import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import './home.css'

const slidesOf = r => (r?.slides?.length ? r.slides : r?.cover ? [r.cover] : [])

function openStatus(opens, closes) {
  if (!opens || !closes) return null
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const o = mins(opens), c = mins(closes)
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes()
  return o <= c ? now >= o && now < c : now >= o || now < c
}

export default function Home() {
  const [list, setList] = useState(undefined) // undefined = зарежда
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    document.title = 'Menuto – поръчай храна'
    getDocs(query(collection(db, 'restaurants'), where('ordersEnabled', '==', true)))
      .then(s => setList(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'bg'))))
      .catch(ex => { setErr(ex.code || ex.message); setList([]) })
  }, [])

  const shown = (list || []).filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="home">
      <header className="home-hero">
        <h1>Menuto</h1>
        <p>Избери заведение, разгледай менюто и поръчай доставка до дома.</p>
        <input className="home-search" type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Търси заведение…" aria-label="Търси заведение" />
      </header>

      <main className="home-wrap">
        {list === undefined && <p className="home-empty">Зареждане…</p>}
        {err && <p className="err">Не се заредиха заведенията: {err}</p>}
        {list && list.length > 0 && shown.length === 0 && <p className="home-empty">Няма заведение с това име.</p>}
        {list && list.length === 0 && !err && <p className="home-empty">Още няма заведения, които приемат поръчки.</p>}

        <div className="home-grid">
          {shown.map(r => {
            const cover = slidesOf(r)[0]
            const open = openStatus(r.opens, r.closes)
            const fee = Number(r.deliveryFee) || 0
            return (
              <Link key={r.id} to={`/${r.id}`} className="rcard" style={{ '--accent': r.color || '#e9b45c' }}>
                <div className="rcover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
                  {open !== null && <span className={`rstatus${open ? '' : ' closed'}`}><i />{open ? 'Отворено' : 'Затворено'}</span>}
                </div>
                <div className="rbody">
                  <div className={`rlogo${r.logo ? (r.logoBg === 'light' ? ' light' : '') : ' init'}`}>
                    {r.logo ? <img src={r.logo} alt="" /> : <span>{r.name.trim().charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="rtext">
                    <strong>{r.name}</strong>
                    <small>{fee > 0 ? `Доставка ${fee.toFixed(2)} ${r.currency || '€'}` : 'Безплатна доставка'}</small>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </main>

      <footer className="home-foot">
        <Link to="/admin">Вход за собственици</Link>
      </footer>
    </div>
  )
}
