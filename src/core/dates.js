// 日期一律用本地日历的 'YYYY-MM-DD' 字符串表示，不经过 UTC 换算，避免跨时区差一天。
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export const pad = n => String(n).padStart(2, '0')

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && toKey(fromKey(key)) === key
}

export const todayKey = (now = new Date()) => toKey(now)

export function addDays(key, n) {
  const date = fromKey(key)
  date.setDate(date.getDate() + n)
  return toKey(date)
}

// 2 月 29 日加若干年落到平年时取 2 月 28 日。
export function addYears(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y + n, m - 1, d)
  if (date.getMonth() !== m - 1) date.setDate(0)
  return toKey(date)
}

// b 减 a 的天数。
export function diffDays(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000)
}

export const weekday = key => fromKey(key).getDay()
export const monthOf = key => key.slice(0, 7)

export function startOfWeek(key) {
  return addDays(key, -((weekday(key) + 6) % 7))
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1 + n, 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function eachDay(from, to) {
  const days = []
  for (let key = from; key <= to; key = addDays(key, 1)) days.push(key)
  return days
}

export function formatMonthDay(key) {
  const [, m, d] = key.split('-').map(Number)
  return `${m}月${d}日`
}

export function formatFull(key) {
  const [y, m, d] = key.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

export const formatDot = key => key.replaceAll('-', '.')
export const weekdayName = key => '星期' + WEEKDAYS[weekday(key)]
export const weekdayShort = key => '周' + WEEKDAYS[weekday(key)]

export function formatMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return `${y}年${m}月`
}

// 1–99 的中文数字，用于“第二辈子”“第七周”之类的称呼。
export function cnNumber(n) {
  if (n <= 10) return CN_DIGITS[n]
  if (n < 20) return '十' + CN_DIGITS[n % 10]
  const tens = CN_DIGITS[Math.floor(n / 10)] + '十'
  return n % 10 ? tens + CN_DIGITS[n % 10] : tens
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function clock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes()
}

// 时长的口语表达：45 分钟、1 小时 30 分、2 小时。
export function duration(minutes) {
  const m = Math.round(minutes)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} 小时 ${m % 60} 分` : `${h} 小时`
}

// 用于统计的小时数：保留一位小数，整数不带小数点。
export function hours(minutes, digits = 1) {
  const h = minutes / 60
  const fixed = h.toFixed(digits)
  return Number(fixed) === Math.round(h) ? String(Math.round(h)) : fixed
}

// 跳转日期的自然输入：10.20、1020、10月20日、2026-10-20、+7、-1、明天、下周三、15号。
const DAY_WORDS = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3, 昨天: -1, 昨日: -1, 前天: -2, 大前天: -3 }
const WEEK_CHARS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7 }

export function parseDateInput(input, today) {
  const text = String(input || '').trim().replace(/\s+/g, '')
  if (!text) return null
  if (text in DAY_WORDS) return addDays(today, DAY_WORDS[text])
  let m = text.match(/^([+-])(\d{1,4})$/) || text.match(/^(\d{1,4})天(后|前)$/)
  if (m) {
    const n = Number(m[1] === '+' || m[1] === '-' ? m[2] : m[1])
    const sign = m[1] === '-' || m[2] === '前' ? -1 : 1
    return addDays(today, sign * n)
  }
  m = text.match(/^(上上|上|下下|下|这|本)?(?:周|星期|礼拜)([一二三四五六日天1-7])$/)
  if (m) {
    const shift = { 上上: -2, 上: -1, 下: 1, 下下: 2 }[m[1]] || 0
    return addDays(startOfWeek(today), shift * 7 + WEEK_CHARS[m[2]] - 1)
  }
  const year = Number(today.slice(0, 4))
  const build = (y, mo, d) => {
    const key = `${y}-${pad(mo)}-${pad(d)}`
    return isValidKey(key) ? key : null
  }
  m = text.match(/^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?$/) || text.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return build(+m[1], +m[2], +m[3])
  m = text.match(/^(\d{1,2})[-./月](\d{1,2})[日号]?$/) || text.match(/^(\d{2})(\d{2})$/)
  if (m) return build(year, +m[1], +m[2])
  m = text.match(/^(\d{1,2})[日号]$/)
  if (m) return build(year, Number(today.slice(5, 7)), +m[1])
  return null
}

export function relativeDay(key, today) {
  const n = diffDays(today, key)
  if (n === 0) return '今天'
  if (n === -1) return '昨天'
  if (n === 1) return '明天'
  if (n === -2) return '前天'
  if (n === 2) return '后天'
  return n < 0 ? `${-n} 天前` : `${n} 天后`
}
