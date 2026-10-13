import { addDays, diffDays } from '../core/dates.js'

// 一万小时：只累加、不清零。境界是沿途的路标，不是考核。
export const TARGET_MINUTES = 10000 * 60

export const REALMS = [
  { hours: 0, name: '初入门墙' },
  { hours: 100, name: '初窥门径' },
  { hours: 500, name: '略有小成' },
  { hours: 1000, name: '登堂入室' },
  { hours: 2500, name: '融会贯通' },
  { hours: 5000, name: '炉火纯青' },
  { hours: 7500, name: '出神入化' },
  { hours: 10000, name: '登峰造极' }
]

export function realmOf(minutes) {
  const h = minutes / 60
  let index = 0
  while (index < REALMS.length - 1 && h >= REALMS[index + 1].hours) index++
  const current = REALMS[index]
  const next = REALMS[index + 1] || null
  const progress = next ? (h - current.hours) / (next.hours - current.hours) : 1
  return { index, current, next, progress, toNext: next ? next.hours * 60 - minutes : 0 }
}

export const practiceOf = (practice, skillId) => practice.filter(p => p.skillId === skillId)
export const totalMinutes = list => list.reduce((s, p) => s + p.minutes, 0)

export function byDay(list) {
  const map = {}
  for (const p of list) map[p.date] = (map[p.date] || 0) + p.minutes
  return map
}

export function minutesBetween(list, from, to) {
  return list.filter(p => p.date >= from && p.date <= to).reduce((s, p) => s + p.minutes, 0)
}

// 近 n 天日均与按此节奏达到一万小时的日期；没有记录时不推算。
export function pace(list, today, days = 30, target = TARGET_MINUTES) {
  const from = addDays(today, -(days - 1))
  const recent = minutesBetween(list, from, today)
  const perDay = recent / days
  const total = totalMinutes(list)
  const left = Math.max(0, target - total)
  const eta = perDay > 0 ? addDays(today, Math.ceil(left / perDay)) : null
  return { perDay, eta, left, total }
}

export function neededPerDay(total, today, end, target = TARGET_MINUTES) {
  const days = diffDays(today, end) + 1
  return days > 0 ? Math.max(0, target - total) / days : 0
}

export const activeDays = list => new Set(list.filter(p => p.minutes > 0).map(p => p.date)).size
