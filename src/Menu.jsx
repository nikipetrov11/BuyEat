import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, getDoc, getDocs, limit, collection, query, where, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth, db } from './firebase'
import Customer from './Customer.jsx'

const byName = (a, b) => a.name.localeCompare(b.name, 'bg')
const catOf = i => i.category || 'Меню'
const norm = c => (typeof c === 'string' ? { name: c, group: '' } : { name: c.name, group: c.group || '' })
const slidesOf = r => (r?.slides?.length ? r.slides : r?.cover ? [r.cover] : [])

// тъмен или светъл текст върху избрания цвят
function onAccent(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#1a1a1a'
  const n = parseInt(m[1], 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? '#1a1a1a' : '#fff'
}

// "Отворено до 23:00" според часа на телефона на клиента
function openStatus(opens, closes) {
  if (!opens || !closes) return null
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const o = mins(opens), c = mins(closes)
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes()
  const open = o <= c ? now >= o && now < c : now >= o || now < c
  return open ? { open, text: `Отворено до ${closes}` } : { open, text: `Затворено · отваря в ${opens}` }
}

export default function Menu() {
  // на "/" няма адрес на заведение: показваме единственото (първото) заведение в базата
  const param = useParams().slug?.toLowerCase()
  const [first, setFirst] = useState(undefined)
  const slug = param || first
  const [rest, setRest] = useState(undefined) // undefined = зарежда, null = няма такова
  const [items, setItems] = useState([])
  const [gActive, setGActive] = useState(null)
  const [cActive, setCActive] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [slide, setSlide] = useState(0)
  const [cart, setCart] = useState({}) // id -> брой
  const [sheet, setSheet] = useState(null) // null | 'cart' | 'orders' | 'login' | 'register'
  const [user, setUser] = useState(undefined) // undefined = проверява се, null = не е влязъл
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  // менюто на акаунта се затваря при клик навън или Escape
  useEffect(() => {
    if (!menuOpen) return
    const away = e => { if (!e.target.closest?.('.acctwrap')) setMenuOpen(false) }
    const esc = e => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [menuOpen])

  useEffect(() => {
    if (param) return
    getDocs(query(collection(db, 'restaurants'), limit(1)))
      .then(s => setFirst(s.empty ? null : s.docs[0].id))
      .catch(() => setFirst(null))
  }, [param])

  useEffect(() => {
    if (!slug) { if (slug === null) setRest(null); return }
    getDoc(doc(db, 'restaurants', slug)).then(s => setRest(s.exists() ? s.data() : null))
    const q = query(collection(db, 'restaurants', slug, 'items'), where('visible', '==', true))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [slug])

  useEffect(() => { if (rest?.name) document.title = rest.name }, [rest])

  useEffect(() => {
    const n = slidesOf(rest).length
    if (n < 2) return
    const t = setInterval(() => setSlide(s => (s + 1) % n), 5000)
    return () => clearInterval(t)
  }, [rest])

  if (rest === undefined) return <main className="wrap"><p>Зареждане…</p></main>
  if (rest === null) return <main className="wrap"><h1>Не намираме това заведение</h1><p>Провери адреса или QR кода.</p></main>

  const slides = slidesOf(rest)
  const idx = slides.length ? slide % slides.length : 0
  const cur = rest.currency || '€'
  const accent = rest.color || '#e9b45c'
  const money = i => `${Number(i.price).toFixed(2)} ${cur}`
  const status = openStatus(rest.opens, rest.closes)

  const all = (rest.categories || []).map(norm)
  items.forEach(i => { if (!all.some(c => c.name === catOf(i))) all.push({ name: catOf(i), group: '' }) })
  const cats = all.filter(c => items.some(i => catOf(i) === c.name))
  const groups = [...new Set(cats.map(c => c.group))]
  const group = groups.includes(gActive) ? gActive : groups[0]
  const inGroup = cats.filter(c => c.group === group)
  const cat = inGroup.find(c => c.name === cActive)?.name || inGroup[0]?.name
  const shown = items.filter(i => catOf(i) === cat).sort(byName)
  const featured = items.filter(i => i.featured)

  const canOrder = !!rest.ordersEnabled
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: items.find(x => x.id === id), qty }))
    .filter(l => l.item && !l.item.soldOut)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const sum = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0)
  const fee = Math.max(0, Number(rest.deliveryFee) || 0)
  const total = sum + fee
  const change = (id, d) => setCart(c => {
    const q = (c[id] || 0) + d
    const n = { ...c }
    if (q <= 0) delete n[id]
    else n[id] = Math.min(q, 20)
    return n
  })
  const clearCart = () => setCart({})

  function goTo(i) {
    const c = all.find(x => x.name === catOf(i))
    setGActive(c ? c.group : '')
    setCActive(catOf(i))
    setOpenId(i.id)
    setTimeout(() => document.getElementById('list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  return (
    <div className="page" style={{ '--accent': accent, '--on-accent': onAccent(accent) }}>
      <div className="shell" style={canOrder && count > 0 ? { paddingBottom: 110 } : undefined}>
        {canOrder && (
          <div className="topbar">
            <div className={`tb-logo${rest.logo ? (rest.logoBg === 'light' ? ' light' : '') : ' init'}`}>
              {rest.logo ? <img src={rest.logo} alt="" /> : <span>{rest.name.trim().charAt(0).toUpperCase()}</span>}
            </div>
            <div className="tb-actions">
              {user === undefined ? null : user ? (
                <>
                  <button type="button" className="tb-btn ghost" onClick={() => setSheet('orders')}>🧾 Поръчки</button>
                  <div className="acctwrap">
                    <button type="button" className="me" aria-label="Акаунт" aria-haspopup="menu" aria-expanded={menuOpen}
                      onClick={() => setMenuOpen(o => !o)}>{(user.email || '?').charAt(0).toUpperCase()}</button>
                    {menuOpen && (
                      <div className="menu-pop" role="menu">
                        <p className="pop-mail">{user.email}</p>
                        <button type="button" role="menuitem" className="mi" onClick={() => { setMenuOpen(false); setSheet('orders') }}>Моите поръчки</button>
                        <button type="button" role="menuitem" className="mi" onClick={() => { setMenuOpen(false); signOut(auth) }}>Изход</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button type="button" className="tb-btn" onClick={() => setSheet('login')}>Вход</button>
                  <button type="button" className="tb-btn fill" onClick={() => setSheet('register')}>Регистрация</button>
                </>
              )}
            </div>
          </div>
        )}
        <header>
          <div className="cover">
            {slides[idx] && <div key={idx} className="hero-bg" style={{ backgroundImage: `url("${slides[idx]}")` }} />}
            {slides.length > 1 && (
              <>
                <button className="arrow l" aria-label="Назад" onClick={() => setSlide((idx + slides.length - 1) % slides.length)}>‹</button>
                <button className="arrow r" aria-label="Напред" onClick={() => setSlide((idx + 1) % slides.length)}>›</button>
                <div className="dots">{slides.map((_, k) => <i key={k} className={k === idx ? 'on' : ''} />)}</div>
              </>
            )}
          </div>

          <div className="idrow">
            <div className={`avatar${rest.logo ? (rest.logoBg === 'light' ? ' light' : '') : ' init'}`}>
              {rest.logo ? <img src={rest.logo} alt={rest.name} /> : <span>{rest.name.trim().charAt(0).toUpperCase()}</span>}
            </div>
            {!rest.hideName && <h1 className="idname">{rest.name}</h1>}
          </div>

          {(status || canOrder) && (
            <div className="toprow">
              {status && <div className={`status${status.open ? '' : ' closed'}`}><i />{status.text}</div>}
              {canOrder && <div className="infochip">🛵 {fee > 0 ? `Доставка ${fee.toFixed(2)} ${cur}` : 'Безплатна доставка'}</div>}
              {canOrder && <div className="infochip">💵 Плащане в брой</div>}
            </div>
          )}
        </header>

        {featured.length > 0 && (
          <section className="feat">
            <h2>Препоръчваме</h2>
            <div className="feat-row">
              {featured.map(i => (
                <button key={i.id} className="fcard" onClick={() => goTo(i)}>
                  <div className="fimg" style={i.photo ? { backgroundImage: `url("${i.photo}")` } : undefined}>
                    <span className="fprice">{money(i)}</span>
                  </div>
                  <strong>{i.name}</strong>
                  {i.desc && <small>{i.desc}</small>}
                </button>
              ))}
            </div>
          </section>
        )}

        {(groups.length > 1 || inGroup.length > 0) && (
          <div className="sticky">
            {groups.length > 1 && (
              <nav className="gtabs" aria-label="Менюта">
                {groups.map(g => (
                  <button key={g} aria-pressed={g === group} onClick={() => { setGActive(g); setCActive(null) }}>{g || 'Меню'}</button>
                ))}
              </nav>
            )}
            {inGroup.length > 0 && (
              <nav className="pills" aria-label="Категории">
                {inGroup.map(c => (
                  <button key={c.name} aria-pressed={c.name === cat} onClick={() => setCActive(c.name)}>{c.name}</button>
                ))}
              </nav>
            )}
          </div>
        )}

        <main className="sec" id="list">
          {cats.length === 0 && <p className="empty">Менюто още е празно.</p>}
          {cat && (
            <>
              <h2>{cat} <small>{shown.length} {shown.length === 1 ? 'продукт' : 'продукта'}</small></h2>
              <div className="list" key={cat}>
                {shown.map(i => (
                  <div role="button" tabIndex={0} key={i.id}
                    className={`dish${openId === i.id ? ' open' : ''}${i.soldOut ? ' out' : ''}`}
                    onClick={() => setOpenId(openId === i.id ? null : i.id)}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(openId === i.id ? null : i.id) }
                    }}>
                    {i.photo && <img className="pic" src={i.photo} alt={i.name} loading="lazy" />}
                    <div className="info">
                      <h3>{i.name}</h3>
                      {i.desc && <p>{i.desc}</p>}
                      {i.soldOut && <em className="tag">изчерпано</em>}
                    </div>
                    <div className="side">
                      <span className="price">{money(i)}</span>
                      {canOrder && !i.soldOut && (cart[i.id] ? (
                        <div className="step" onClick={e => e.stopPropagation()}>
                          <button type="button" aria-label="Намали" onClick={() => change(i.id, -1)}>−</button>
                          <b>{cart[i.id]}</b>
                          <button type="button" aria-label="Увеличи" onClick={() => change(i.id, 1)}>+</button>
                        </div>
                      ) : (
                        <button type="button" className="add" aria-label={`Добави ${i.name}`}
                          onClick={e => { e.stopPropagation(); change(i.id, 1) }}>+</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {canOrder && count > 0 && !sheet && (
        <button type="button" className="cartbar" onClick={() => setSheet('cart')}>
          <span>Виж поръчката · {count}</span>
          <strong>{sum.toFixed(2)} {cur}</strong>
        </button>
      )}

      {canOrder && (
        <Customer shop={rest.name} hasCart={count > 0} user={user} mode={sheet} setMode={setSheet} slug={slug} cur={cur}
          lines={lines} sum={sum} fee={fee} total={total} change={change} clearCart={clearCart} />
      )}
    </div>
  )
}
