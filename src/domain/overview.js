import { eachDay } from '../core/dates.js'
import { parseLog, summarize, minutesOf } from './timelog.js'
import { entriesIn, summarizeEntries, worth, liquidity } from './ledger.js'
import { totalMinutes, minutesBetween } from './skill.js'

// 人生资产负债表：按“注意力 > 时间 > 金钱”，再加身体、自学、积累。
// 只与自己比较，不设红线；没有记录的天不计入平均，避免把“没记”当成“没做”。
export function balanceSheet(state, from, to) {
  const days = eachDay(from, to)
  const logged = days.filter(d => state.timelog[d]?.text?.trim())
  const allEntries = []
  const perDay = []
  for (const d of logged) {
    const { entries } = parseLog(state.timelog[d].text)
    allEntries.push(...entries)
    perDay.push({
      date: d,
      shortvideo: minutesOf(entries, 'shortvideo'),
      sleep: minutesOf(entries, 'sleep'),
      sport: minutesOf(entries, 'sport')
    })
  }
  const time = summarize(allEntries)
  const sleepDays = perDay.filter(d => d.sleep > 0)
  const ledgerSummary = summarizeEntries(state.ledger, entriesIn(state.ledger, from, to))
  const skill = state.skills.find(s => s.active) || state.skills[state.skills.length - 1] || null
  const practice = skill ? state.practice.filter(p => p.skillId === skill.id) : []
  const gratitudeDays = days.filter(d => (state.gratitude[d] || []).some(t => t?.trim()))
  const lib = state.library

  return {
    days: days.length,
    loggedDays: logged.length,
    attention: {
      shortvideo: time.categories.find(c => c.id === 'shortvideo')?.minutes || 0,
      clearDays: perDay.filter(d => d.shortvideo === 0).length,
      perDay: perDay.map(d => ({ date: d.date, value: d.shortvideo }))
    },
    time,
    body: {
      sport: perDay.reduce((s, d) => s + d.sport, 0),
      sportDays: perDay.filter(d => d.sport > 0).length,
      sleepAvg: sleepDays.length ? sleepDays.reduce((s, d) => s + d.sleep, 0) / sleepDays.length : 0,
      sleepDays: sleepDays.length
    },
    money: { ...ledgerSummary, worth: worth(state.ledger), liquidity: liquidity(state.ledger, to) },
    skill: skill && {
      name: skill.name,
      inRange: minutesBetween(practice, from, to),
      total: totalMinutes(practice)
    },
    accumulate: {
      gratitudeDays: gratitudeDays.length,
      gratitudeTotal: Object.values(state.gratitude).filter(list => (list || []).some(t => t?.trim())).length,
      itemsAdded: lib.items.filter(i => i.addedAt >= from && i.addedAt <= to).length,
      itemsTotal: lib.items.length,
      usesInRange: lib.uses.filter(u => u.date >= from && u.date <= to).length,
      usesTotal: lib.uses.length
    }
  }
}
