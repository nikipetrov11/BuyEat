// Смалява снимка в браузъра и я връща като текст (data URL), за да се пази във Firestore без Storage.
export function fileToDataUrl(file, max = 800, quality = 0.72, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s)
      c.height = Math.round(img.height * s)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL(type, quality))
    }
    img.onerror = reject
    img.src = url
  })
}

const BG = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sht',ъ:'a',ь:'y',ю:'yu',я:'ya' }

// "Рафи Бар" или "Raffi Bar" -> "rafi-bar" (главни букви и кирилица са позволени при писане)
export const slugify = s =>
  s.toLowerCase().split('').map(c => BG[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)

// Статуси на поръчка, от приемане до доставка
export const STEPS = [['new', 'Приета'], ['preparing', 'Приготвя се'], ['delivering', 'На път'], ['done', 'Доставена']]

// Адресът се пази като обект; по-старите поръчки може да са с обикновен текст
export const fmtAddr = a => {
  if (!a) return ''
  if (typeof a === 'string') return a
  return [
    a.street && `${a.street} ${a.number || ''}`.trim(),
    a.entrance && `вх. ${a.entrance}`,
    a.floor && `ет. ${a.floor}`,
    a.apt && `ап. ${a.apt}`,
    a.city,
  ].filter(Boolean).join(', ')
}
