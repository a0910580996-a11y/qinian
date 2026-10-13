import { addDays, addYears, diffDays, cnNumber } from '../core/dates.js'

// “七年就是一辈子”：每辈子默认从开始日起算七年。
// 第一辈子是例外——从出生到第二辈子开始的前一天，长度由真实经历决定。
export const LIFE_YEARS = 7

export const lifeName = no => `第${cnNumber(no)}辈子`

// 按开始日排序，补全结束日：显式结束日 > 下一辈子开始前一天 > 开始日起七年。
export function normalizeLives(lives) {
  const sorted = [...lives].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.map((life, i) => {
    const next = sorted[i + 1]
    const end = life.end || (next ? addDays(next.start, -1) : addDays(addYears(life.start, LIFE_YEARS), -1))
    return { ...life, no: i + 1, name: lifeName(i + 1), end, days: diffDays(life.start, end) + 1 }
  })
}

// 在已记录的辈子之后推演若干个未来的辈子，用于里程碑跨辈子延续时显示去处。
export function withFuture(lives, count = 1) {
  const list = normalizeLives(lives)
  for (let i = 0; i < count; i++) {
    const last = list[list.length - 1]
    const start = addDays(last.end, 1)
    const end = addDays(addYears(start, LIFE_YEARS), -1)
    list.push({ start, end, no: last.no + 1, name: lifeName(last.no + 1), days: diffDays(start, end) + 1, future: true })
  }
  return list
}

export function lifeOf(lives, key) {
  return lives.find(life => key >= life.start && key <= life.end) || null
}

// 某天位于哪一辈子的第几天、第几年，以及该年的进度。
export function lifePosition(lives, key) {
  const life = lifeOf(normalizeLives(lives), key)
  if (!life) return null
  const day = diffDays(life.start, key) + 1
  let year = 1
  while (year < LIFE_YEARS * 4 && addYears(life.start, year) <= key) year++
  const yearStart = addYears(life.start, year - 1)
  const yearEnd = addDays(addYears(life.start, year), -1)
  return {
    life,
    day,
    remaining: life.days - day,
    year,
    yearDay: diffDays(yearStart, key) + 1,
    yearDays: diffDays(yearStart, yearEnd) + 1,
    yearStart,
    yearEnd
  }
}

// 某辈子的七个年度区间（第一辈子按真实年数切分）。
export function lifeYears(life) {
  const years = []
  for (let i = 0; ; i++) {
    const start = addYears(life.start, i)
    if (start > life.end) break
    const natural = addDays(addYears(life.start, i + 1), -1)
    years.push({ index: i + 1, start, end: natural < life.end ? natural : life.end })
  }
  return years
}

export function ageOn(birthday, key) {
  let age = Number(key.slice(0, 4)) - Number(birthday.slice(0, 4))
  if (key.slice(5) < birthday.slice(5)) age--
  return age
}

export function nextBirthday(birthday, key) {
  const age = ageOn(birthday, key)
  const date = addYears(birthday, age + 1)
  return { age: age + 1, date, days: diffDays(key, date) }
}
