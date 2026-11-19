import { useEffect, useState } from 'react'
import {
  signOut, sendPasswordResetEmail,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'firebase/auth'
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { auth, db } from './firebase'
import { STEPS, fmtAddr } from './util'

const AUTH_ERR = {
  'auth/invalid-credential': 'Грешен имейл или парола.',
  'auth/wrong-password': 'Грешен имейл или парола.',
  'auth/user-not-found': 'Грешен имейл или парола.',
  'auth/email-already-in-use': 'Вече има акаунт с този имейл. Влез.',
  'auth/weak-password': 'Паролата трябва да е поне 6 символа.',
  'auth/invalid-email': 'Невалиден имейл.',
  'auth/too-many-requests': 'Твърде много опити. Опитай по-късно.',
}

const EMPTY = { name: '', phone: '', city: '', street: '', number: '', entrance: '', floor: '', apt: '', note: '' }

function AuthForm({ hint, startNew }) {
  const [isNew, setIsNew] = useState(!!startNew)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const switchTo = v => { setIsNew(v); setErr(''); setInfo('') }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setInfo('')
    setBusy(true)
    try {
      if (isNew) await createUserWithEmailAndPassword(auth, email.trim(), pass)
      else await signInWithEmailAndPassword(auth, email.trim(), pass)
    } catch (ex) {
      setErr(AUTH_ERR[ex.code] || 'Неуспешен вход. ' + (ex.code || ''))
    }
    setBusy(false)
  }

  async function reset() {
    setErr('')
    setInfo('')
    if (!email.trim()) return setErr('Напиши имейла си в полето по-горе.')
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setInfo('Изпратихме линк за нова парола на имейла ти.')
    } catch (ex) {
      setErr(AUTH_ERR[ex.code] || 'Не успяхме да изпратим имейл.')
    }
  }

  return (
    <form onSubmit={submit} className="authform">
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={!isNew} className={!isNew ? 'on' : ''} onClick={() => switchTo(false)}>Вход</button>
        <button type="button" role="tab" aria-selected={isNew} className={isNew ? 'on' : ''} onClick={() => switchTo(true)}>Регистрация</button>
      </div>
      <h2>{isNew ? 'Създай акаунт' : 'Здравей отново'}</h2>
      <p className="paynote">
        {hint || (isNew
          ? 'Нужни са само имейл и парола. Адресът ти се запомня за следващите поръчки.'
          : 'Влез, за да поръчваш и да следиш поръчките си на живо.')}
      </p>
      <label>Имейл
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="ime@primer.bg" />
      </label>
      <label>Парола
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} required minLength={6} autoComplete={isNew ? 'new-password' : 'current-password'} placeholder="Поне 6 символа" />
      </label>
      {err && <p className="err">{err}</p>}
      {info && <p className="ok">{info}</p>}
      <button className="send" disabled={busy}>{busy ? 'Момент…' : isNew ? 'Регистрирай ме' : 'Влез'}</button>
      {!isNew && <button type="button" className="link" onClick={reset}>Забравена парола</button>}
    </form>
  )
}

const shortId = id => String(id || '').slice(0, 6).toUpperCase()

// Разписка за поръчка: показва се веднага след изпращане и по всяко време от "Моите поръчки"
function Receipt({ o, cur, shop }) {
  const d = o.createdAt?.toDate?.() || (o.createdAt instanceof Date ? o.createdAt : null)
  const items = o.items || []
  const sum = items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0)
  const fee = Number(o.fee || 0)
  const st = STEPS.find(x => x[0] === (o.status || 'new'))
  const money = n => `${Number(n).toFixed(2)} ${cur}`
  return (
    <div className="receipt">
      <div className="rc-head"><strong>{shop}</strong><span>Разписка за поръчка</span></div>
      <div className="rc-meta">
        <span>№ {shortId(o.id)}</span>
        <span>{d ? d.toLocaleString('bg', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Току-що'}</span>
      </div>
      <ul className="rc-items">
        {items.map((i, k) => (
          <li key={k}><span>{i.qty}× {i.name}</span><b>{money(Number(i.price) * Number(i.qty))}</b></li>
        ))}
      </ul>
      <div className="rc-row"><span>Ястия</span><span>{money(sum)}</span></div>
      <div className="rc-row"><span>Доставка</span><span>{fee > 0 ? money(fee) : 'Безплатна'}</span></div>
      <div className="rc-total"><span>Общо</span><strong>{money(sum + fee)}</strong></div>
      <dl className="rc-info">
        <dt>Плащане</dt><dd>В брой при доставка</dd>
        <dt>Статус</dt><dd>{st ? st[1] : 'Приета'}</dd>
        <dt>Клиент</dt><dd>{o.name}{o.phone ? `, ${o.phone}` : ''}</dd>
        <dt>Адрес</dt><dd>{fmtAddr(o.address)}</dd>
        {o.note && <><dt>Бележка</dt><dd>{o.note}</dd></>}
      </dl>
      <p className="rc-foot">Това е потвърждение на поръчката, не е фискален бон. Фискалният бон се издава от заведението при доставката.</p>
    </div>
  )
}

function OrderCard({ o, cur, onReceipt }) {
  const st = o.status || 'new'
  const idx = Math.max(0, STEPS.findIndex(s => s[0] === st))
  const total = (o.items || []).reduce((s, i) => s + Number(i.price) * Number(i.qty), 0) + Number(o.fee || 0)
  const d = o.createdAt?.toDate?.()
  return (
    <div className="mycard">
      <div className="mytop">
        <strong>{d ? d.toLocaleString('bg', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Току-що'}</strong>
        <span className={`pill ${st}`}>{STEPS[idx][1]}</span>
      </div>
      <ol className="track">
        {STEPS.map(([k, t], i) => <li key={k} className={i <= idx ? 'on' : ''}><i /><span>{t}</span></li>)}
      </ol>
      <ul className="oitems">
        {(o.items || []).map((i, k) => (
          <li key={k}><b>{i.qty}×</b> {i.name} <span className="muted">{(Number(i.price) * Number(i.qty)).toFixed(2)} {cur}</span></li>
        ))}
      </ul>
      <p className="muted">📍 {fmtAddr(o.address)}</p>
      {Number(o.fee) > 0 && <p className="muted">Доставка: {Number(o.fee).toFixed(2)} {cur}</p>}
      <div className="ototal"><span>Общо</span><strong>{total.toFixed(2)} {cur}</strong></div>
      <button type="button" className="link" onClick={() => onReceipt(o)}>Виж разписката</button>
    </div>
  )
}

// user идва от Menu: undefined = още се проверява, null = не е влязъл
export default function Customer({ shop, hasCart, user, mode, setMode, slug, cur, lines, sum, fee, total, change, clearCart }) {
  const [f, setF] = useState(EMPTY)
  const [mine, setMine] = useState([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [receipt, setReceipt] = useState(null) // поръчка, чиято разписка се гледа
  const [last, setLast] = useState(null) // току-що изпратената поръчка
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))

  // след успешен вход или регистрация затваряме прозореца
  useEffect(() => {
    if (user && (mode === 'login' || mode === 'register')) setMode(null)
  }, [user, mode])

  // запазени данни от предишна поръчка
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid)).then(s => {
      const p = s.data()
      if (p) setF(x => ({ ...x, name: p.name || '', phone: p.phone || '', ...(p.address || {}) }))
    }).catch(() => {})
  }, [user?.uid])

  // моите поръчки в това заведение, на живо
  useEffect(() => {
    if (!user) { setMine([]); return }
    const q = query(collection(db, 'restaurants', slug, 'orders'), where('customerId', '==', user.uid))
    return onSnapshot(q, s => {
      const list = s.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds ?? 9e15) - (a.createdAt?.seconds ?? 9e15))
      setMine(list)
    }, () => {})
  }, [user?.uid, slug])

  async function send(e) {
    e.preventDefault()
    if (!lines.length || !user) return
    setErr('')
    setBusy(true)
    const address = {
      city: f.city.trim(), street: f.street.trim(), number: f.number.trim(),
      entrance: f.entrance.trim(), floor: f.floor.trim(), apt: f.apt.trim(),
    }
    try {
      const data = {
        customerId: user.uid,
        name: f.name.trim(),
        phone: f.phone.trim(),
        address,
        note: f.note.trim(),
        items: lines.map(l => ({ name: l.item.name, price: Number(l.item.price), qty: l.qty })),
        fee,
        status: 'new',
        createdAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'restaurants', slug, 'orders'), data)
      setLast({ ...data, id: ref.id, createdAt: new Date() })
      setDoc(doc(db, 'users', user.uid), { name: f.name.trim(), phone: f.phone.trim(), address }, { merge: true }).catch(() => {})
      clearCart()
      setF(x => ({ ...x, note: '' }))
      setSent(true)
    } catch (ex) {
      console.error(ex)
      setErr('Поръчката не се изпрати. Опитай пак. (' + (ex.code || ex.message) + ')')
    }
    setBusy(false)
  }

  const active = mine.filter(o => (o.status || 'new') !== 'done')
  const past = mine.filter(o => (o.status || 'new') === 'done')

  // докато прозорецът е затворен, текущата поръчка се вижда в лента най-долу
  if (!mode) {
    if (!user || active.length === 0) return null
    const a = active[0]
    const label = (STEPS.find(x => x[0] === (a.status || 'new')) || STEPS[0])[1]
    return (
      <button type="button" className={`trackbar${hasCart ? ' up' : ''}`} onClick={() => setMode('orders')}>
        <i className={`dot ${a.status || 'new'}`} />
        <span>Поръчка № {shortId(a.id)} · <b>{label}</b>{active.length > 1 ? ` (+${active.length - 1})` : ''}</span>
        <em>Виж</em>
      </button>
    )
  }
  if (user && (mode === 'login' || mode === 'register')) return null
  const close = () => { setMode(null); setSent(false); setErr(''); setReceipt(null) }
  const who = user && (
    <p className="paynote">Влязъл като {user.email} · <button type="button" className="link" onClick={() => signOut(auth)}>Изход</button></p>
  )
  const hint = mode === 'cart'
    ? 'За да поръчаш, влез или се регистрирай. Избраните ястия се запазват.'
    : mode === 'orders'
      ? 'Влез, за да видиш статуса и историята на поръчките си.'
      : undefined
  const label = mode === 'orders' ? 'Моите поръчки' : mode === 'cart' ? 'Твоята поръчка' : 'Вход и регистрация'

  let body
  if (user === undefined) {
    body = <p className="empty">Зареждане…</p>
  } else if (!user) {
    body = <AuthForm key={mode} hint={hint} startNew={mode === 'register'} />
  } else if (receipt) {
    body = (
      <>
        <Receipt o={receipt} cur={cur} shop={shop} />
        <div className="rc-actions">
          <button type="button" onClick={() => window.print()}>Печат / запази като PDF</button>
          <button type="button" className="link" onClick={() => setReceipt(null)}>Назад</button>
        </div>
      </>
    )
  } else if (mode === 'orders') {
    body = (
      <>
        <h2>Моите поръчки</h2>
        {mine.length === 0 && <p className="empty">Още нямаш поръчки.</p>}
        {active.length > 0 && <h3 className="sub">Текущи</h3>}
        {active.map(o => <OrderCard key={o.id} o={o} cur={cur} onReceipt={setReceipt} />)}
        {past.length > 0 && <h3 className="sub">История</h3>}
        {past.map(o => <OrderCard key={o.id} o={o} cur={cur} onReceipt={setReceipt} />)}
        {who}
      </>
    )
  } else if (sent) {
    body = (
      <div className="sent">
        <h2>Поръчката е изпратена ✓</h2>
        <p>Можеш да следиш статуса ѝ на живо. Разписката остава в „Моите поръчки“.</p>
        {last && <Receipt o={last} cur={cur} shop={shop} />}
        <div className="rc-actions">
          <button type="button" onClick={() => { setSent(false); setMode('orders') }}>Виж статуса</button>
          <button type="button" className="ghostbtn" onClick={() => window.print()}>Печат / PDF</button>
          <button type="button" className="link" onClick={close}>Затвори</button>
        </div>
      </div>
    )
  } else {
    body = (
      <form onSubmit={send}>
        <h2>Твоята поръчка</h2>
        <div className="olines">
          {lines.length === 0 && <p className="empty">Няма избрани ястия.</p>}
          {lines.map(l => (
            <div className="oline" key={l.item.id}>
              <span className="oname">{l.item.name}</span>
              <div className="step">
                <button type="button" aria-label="Намали" onClick={() => change(l.item.id, -1)}>−</button>
                <b>{l.qty}</b>
                <button type="button" aria-label="Увеличи" onClick={() => change(l.item.id, 1)}>+</button>
              </div>
              <span className="osum">{(Number(l.item.price) * l.qty).toFixed(2)} {cur}</span>
            </div>
          ))}
        </div>
        <label>Име
          <input value={f.name} onChange={set('name')} required maxLength={60} autoComplete="name" />
        </label>
        <label>Телефон
          <input type="tel" value={f.phone} onChange={set('phone')} required minLength={5} maxLength={30} autoComplete="tel" placeholder="Напр. 0888 123 456" />
        </label>
        <label>Град
          <input value={f.city} onChange={set('city')} required minLength={2} maxLength={60} autoComplete="address-level2" />
        </label>
        <div className="addr">
          <label>Улица
            <input value={f.street} onChange={set('street')} required minLength={2} maxLength={100} autoComplete="address-line1" />
          </label>
          <label>Номер
            <input value={f.number} onChange={set('number')} required maxLength={10} />
          </label>
        </div>
        <div className="addr3">
          <label>Вход <input value={f.entrance} onChange={set('entrance')} maxLength={10} /></label>
          <label>Етаж <input value={f.floor} onChange={set('floor')} maxLength={10} /></label>
          <label>Апарт. <input value={f.apt} onChange={set('apt')} maxLength={10} /></label>
        </div>
        <label>Бележка (по желание)
          <textarea value={f.note} onChange={set('note')} maxLength={300} placeholder="Напр. без лук, звънецът не работи" />
        </label>
        <div className="osub"><span>Ястия</span><span>{sum.toFixed(2)} {cur}</span></div>
        <div className="osub"><span>Доставка</span><span>{fee > 0 ? `${fee.toFixed(2)} ${cur}` : 'Безплатна'}</span></div>
        <div className="ototal"><span>Общо</span><strong>{total.toFixed(2)} {cur}</strong></div>
        <p className="paynote">Плащане: в брой при доставка.</p>
        {err && <p className="err">{err}</p>}
        <button className="send" disabled={busy || !lines.length}>{busy ? 'Изпращане…' : 'Изпрати поръчката'}</button>
        <button type="button" className="link" onClick={close}>Назад към менюто</button>
        {who}
      </form>
    )
  }

  return (
    <div className="sheet-bg" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}>
        {body}
        {mode === 'orders' && user && <button type="button" className="link close-link" onClick={close}>Затвори</button>}
        {!user && user !== undefined && <button type="button" className="link close-link" onClick={close}>Назад към менюто</button>}
      </div>
    </div>
  )
}
