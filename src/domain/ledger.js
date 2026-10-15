import { monthOf, addMonths, addDays, diffDays, daysInMonth, pad } from '../core/dates.js'

// 账本 = 两张表 + 四笔钱：
// · 资产负债表（存量）——此刻我有什么、欠什么：活钱 + 稳钱 + 长钱 − 负债 = 净资产。
// · 现金流（流量）——一段时间里钱从哪来、到哪去：收入 − 支出 = 结余。
// · 四笔钱（借鉴有知有行）——按用途分：活钱管日常与应急，保险管意外，稳钱管 1–3 年内要花的，长钱管 3 年以上不用的。
//   顺序是先活钱、再保险、再稳钱、最后长钱：前一笔放够了，多出来的才往下流。
// entry.type：expense 支出 / income 收入 / transfer 账户间转移 / adjust 核对余额。
// 负债账户的余额是负数：用花呗消费让它更负，还款（转入）让它回到 0。

export const ACCOUNT_KINDS = [
  { id: 'cash', name: '活钱', hint: '日常开销与应急：微信、支付宝、银行卡、现金、备用金' },
  { id: 'stable', name: '稳钱', hint: '1–3 年内要用的钱：定期、稳健理财' },
  { id: 'long', name: '长钱', hint: '3 年以上不用的钱：定投指数基金' },
  { id: 'debt', name: '负债', hint: '花呗、信用卡、借款、助学贷款' }
]

export const BUCKETS = [
  { id: 'cash', no: 1, name: '活钱', purpose: '日常开销与应急，随时能取' },
  { id: 'insurance', no: 2, name: '保险', purpose: '家庭保障，用小钱扛住大意外' },
  { id: 'stable', no: 3, name: '稳钱', purpose: '1–3 年内要花的钱，求稳不求高' },
  { id: 'long', no: 4, name: '长钱', purpose: '3 年以上不用的钱，交给时间' }
]

export const POLICY_TYPES = [
  { id: 'medical', name: '医疗' },
  { id: 'accident', name: '意外' },
  { id: 'critical', name: '重疾' },
  { id: 'life', name: '寿险' },
  { id: 'other', name: '其他' }
]

// 收入的“等级”借用李笑来对出售时间方式的划分，另加转移收入与资本收入两端。
export const INCOME_LEVELS = [
  { id: 0, name: '转移', hint: '父母给的生活费，不来自自己的能力' },
  { id: 1, name: '一份时间卖一次', hint: '家教、兼职：不做就没有' },
  { id: 2, name: '一份时间卖多次', hint: '课程、文章、作品：做一次，持续有人买' },
  { id: 3, name: '购买他人时间再出售', hint: '组织团队、机构' },
  { id: 4, name: '资本', hint: '钱为你工作：投资收益' }
]

export const STABILITY = [
  { id: 'stable', name: '稳定' },
  { id: 'fair', name: '较稳定' },
  { id: 'volatile', name: '波动' },
  { id: 'occasional', name: '偶尔' }
]

export const SOURCE_GROUPS = [
  { id: 'parents', name: '父母给的' },
  { id: 'self', name: '自己赚的' }
]

const kindOf = (ledger, id) => ledger.accounts.find(a => a.id === id)?.kind || 'cash'
const kindName = id => ACCOUNT_KINDS.find(k => k.id === id)?.name || ''

export function balances(ledger, upTo = null) {
  const result = Object.fromEntries(ledger.accounts.map(a => [a.id, a.opening || 0]))
  const add = (id, amount) => (result[id] = (result[id] || 0) + amount)
  for (const e of ledger.entries) {
    if (upTo && e.date > upTo) continue
    if (e.type === 'expense') add(e.account, -e.amount)
    else if (e.type === 'income' || e.type === 'adjust') add(e.account, e.amount)
    else if (e.type === 'transfer') {
      add(e.account, -e.amount)
      add(e.to, e.amount)
    }
  }
  return result
}

export function worth(ledger, upTo = null) {
  const bal = balances(ledger, upTo)
  const sum = kind => ledger.accounts.filter(a => a.kind === kind).reduce((s, a) => s + (bal[a.id] || 0), 0)
  const cash = sum('cash')
  const stable = sum('stable')
  const long = sum('long')
  const liabilities = 0 - sum('debt')
  const assets = cash + stable + long
  return { cash, stable, long, assets, liabilities, net: assets - liabilities, balances: bal }
}

// 转移的含义由两端账户的类型决定。
export function transferKind(ledger, e) {
  const from = kindOf(ledger, e.account)
  const to = kindOf(ledger, e.to)
  if (to === 'debt' && from !== 'debt') return { id: 'repay', name: '还款' }
  if (from === 'debt' && to !== 'debt') return { id: 'borrow', name: '借入' }
  if (from !== to && to === 'cash') return { id: 'back', name: `${kindName(from)}取回活钱` }
  if (from !== to) return { id: to, name: `转入${kindName(to)}` }
  return { id: 'move', name: '转移' }
}

function group(items, keyOf) {
  const map = new Map()
  for (const item of items) {
    const key = keyOf(item)
    map.set(key, (map.get(key) || 0) + item.amount)
  }
  return [...map].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount)
}

export function summarizeEntries(ledger, entries) {
  const incomes = entries.filter(e => e.type === 'income')
  const expenses = entries.filter(e => e.type === 'expense')
  const streamOf = id => ledger.streams.find(s => s.id === id)
  const income = incomes.reduce((s, e) => s + e.amount, 0)
  const expense = expenses.reduce((s, e) => s + e.amount, 0)
  const flows = { stable: 0, long: 0, back: 0, repay: 0, borrow: 0 }
  for (const e of entries.filter(x => x.type === 'transfer')) {
    const kind = transferKind(ledger, e).id
    if (kind in flows) flows[kind] += e.amount
  }
  return {
    income,
    expense,
    net: income - expense,
    bySource: group(incomes, e => e.stream || 'unknown'),
    byGroup: group(incomes, e => streamOf(e.stream)?.group || 'self'),
    byLevel: group(incomes, e => streamOf(e.stream)?.level ?? 1),
    byCategory: group(expenses, e => e.category || 'other'),
    flows,
    count: entries.length
  }
}

export const entriesIn = (ledger, from, to) => ledger.entries.filter(e => e.date >= from && e.date <= to)
export const entriesOfMonth = (ledger, month) => ledger.entries.filter(e => monthOf(e.date) === month)
export const summarizeMonth = (ledger, month) => summarizeEntries(ledger, entriesOfMonth(ledger, month))

export function fixedTotal(ledger) {
  return ledger.fixed.reduce((s, f) => s + (f.amount || 0), 0)
}

// 定投按月折算：每周一次按 52/12 次计。
export function plansMonthly(ledger) {
  return ledger.plans
    .filter(p => p.active !== false)
    .reduce((s, p) => s + Math.round((p.amount || 0) * (p.freq === 'weekly' ? 52 / 12 : p.freq === 'biweekly' ? 26 / 12 : 1)), 0)
}

// 每月生活费：手动设定优先；否则取本月以前最近三个有支出的月份的平均；再否则用固定支出合计。
export function monthlyNeed(ledger, today) {
  if (ledger.living?.monthly > 0) return { amount: ledger.living.monthly, basis: 'manual' }
  const current = monthOf(today)
  const months = [...new Set(ledger.entries.filter(e => e.type === 'expense' && monthOf(e.date) < current).map(e => monthOf(e.date)))].sort().slice(-3)
  if (months.length) {
    const total = ledger.entries.filter(e => e.type === 'expense' && months.includes(monthOf(e.date))).reduce((s, e) => s + e.amount, 0)
    return { amount: Math.round(total / months.length), basis: 'history', months: months.length }
  }
  const fixed = fixedTotal(ledger)
  return fixed ? { amount: fixed, basis: 'fixed' } : { amount: 0, basis: null }
}

// 本月可支配：本月收入（含还没到账的稳定收入）先扣掉固定开销，剩下的才是能自由花的。
// 已付的固定开销按它的标签从支出里认出来，避免重复扣。
export function monthBudget(ledger, today) {
  const month = monthOf(today)
  const entries = entriesOfMonth(ledger, month)
  const sum = summarizeEntries(ledger, entries)
  let pending = 0
  for (const s of ledger.streams.filter(x => x.stability === 'stable' && x.monthly > 0)) {
    const received = entries.filter(e => e.type === 'income' && e.stream === s.id).reduce((t, e) => t + e.amount, 0)
    pending += Math.max(0, s.monthly - received)
  }
  const income = sum.income + pending
  const fixed = fixedTotal(ledger)
  let fixedPaid = 0
  for (const f of ledger.fixed) {
    const spent = entries.filter(e => e.type === 'expense' && e.category === f.category).reduce((t, e) => t + e.amount, 0)
    fixedPaid += Math.min(f.amount || 0, spent)
  }
  const flexibleSpent = sum.expense - fixedPaid
  const disposable = income - fixed
  const remaining = disposable - flexibleSpent
  const daysLeft = daysInMonth(month) - Number(today.slice(8)) + 1
  return {
    income,
    received: sum.income,
    pending,
    fixed,
    fixedUnpaid: fixed - fixedPaid,
    flexibleSpent,
    disposable,
    remaining,
    daysLeft,
    perDay: daysLeft > 0 ? remaining / daysLeft : 0,
    known: income > 0
  }
}

// 不知道每月生活费填多少时的参考：每月稳定收入（学生的花销大多以生活费为限），或者把最近记账的天数折成一个月。
export function livingHints(ledger, today) {
  const hints = []
  const stable = ledger.streams.filter(s => s.stability === 'stable' && s.monthly > 0).reduce((t, s) => t + s.monthly, 0)
  if (stable) hints.push({ amount: stable, label: '按每月稳定收入' })
  const first = ledger.entries.filter(e => e.type === 'expense').map(e => e.date).sort()[0]
  if (first) {
    const from = first > addDays(today, -29) ? first : addDays(today, -29)
    const days = diffDays(from, today) + 1
    const spent = entriesIn(ledger, from, today).filter(e => e.type === 'expense').reduce((t, e) => t + e.amount, 0)
    if (days >= 7 && spent > 0) hints.push({ amount: Math.max(10000, Math.round((spent / days) * 30 / 10000) * 10000), label: `按最近 ${days} 天的记账估算` })
  }
  return hints
}

// 活钱：按每月生活费，放够“下限—上限”个月（默认 3–6 个月）。
export function liquidity(ledger, today) {
  const { cash } = worth(ledger)
  const need = monthlyNeed(ledger, today)
  const minMonths = ledger.living?.minMonths || 3
  const maxMonths = Math.max(minMonths, ledger.living?.maxMonths || 6)
  const minAmount = need.amount * minMonths
  const maxAmount = need.amount * maxMonths
  const status = !need.amount ? 'unknown' : cash < minAmount ? 'low' : cash > maxAmount ? 'high' : 'ok'
  return {
    amount: cash,
    need,
    minMonths,
    maxMonths,
    minAmount,
    maxAmount,
    months: need.amount > 0 ? cash / need.amount : null,
    status,
    gap: Math.max(0, minAmount - cash),
    surplus: need.amount ? Math.max(0, cash - maxAmount) : 0,
    reserved: monthBudget(ledger, today).fixedUnpaid
  }
}

export function stableNeed(ledger) {
  const { stable } = worth(ledger)
  const goals = [...(ledger.stableGoals || [])].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
  const target = goals.reduce((s, g) => s + (g.amount || 0), 0)
  return { amount: stable, target, gap: Math.max(0, target - stable), goals }
}

export function insurance(ledger) {
  const policies = ledger.policies || []
  return {
    policies,
    premium: policies.reduce((s, p) => s + (p.premium || 0), 0),
    covered: new Set(policies.map(p => p.type))
  }
}

// 四笔钱的“下一步”：按先活钱、再保险、再稳钱、最后长钱的顺序，找第一处没放好的。
export function nextStep(ledger, today) {
  const cash = liquidity(ledger, today)
  const stable = stableNeed(ledger)
  const ins = insurance(ledger)
  if (cash.status === 'unknown') return { bucket: 'cash', kind: 'setup', gap: 0 }
  if (cash.status === 'low') return { bucket: 'cash', kind: 'fill', gap: cash.gap }
  if (!ins.policies.length) return { bucket: 'insurance', kind: 'review', gap: 0 }
  if (stable.gap > 0) return { bucket: 'stable', kind: 'fill', gap: stable.gap, surplus: cash.amount - cash.minAmount }
  if (cash.status === 'high') return { bucket: 'long', kind: 'move', gap: cash.surplus }
  return { bucket: null, kind: 'steady', gap: 0 }
}

// 分一笔钱（这笔钱眼下在活钱里）：先保证活钱不低于下限，再补稳钱的缺口，剩下的给长钱。
// 还不知道每月生活费时算不出下限，宁可全部留在活钱，也不往下流。
export function allocate(ledger, today, amount) {
  const cash = liquidity(ledger, today)
  if (cash.status === 'unknown') return { keep: amount, stable: 0, long: 0 }
  const stable = stableNeed(ledger)
  const keep = Math.min(amount, Math.max(0, cash.minAmount - (cash.amount - amount)))
  const rest = amount - keep
  const toStable = Math.min(rest, stable.gap)
  return { keep, stable: toStable, long: rest - toStable }
}

// 财务体检：净资产、负债率、活钱月数、储蓄率、收入里自己赚的比例。
export function health(ledger, today) {
  const w = worth(ledger)
  const month = summarizeMonth(ledger, monthOf(today))
  const recent = summarizeEntries(ledger, entriesIn(ledger, addMonths(monthOf(today), -2) + '-01', today))
  const self = recent.byGroup.find(g => g.id === 'self')?.amount || 0
  return {
    worth: w,
    debtRatio: w.assets > 0 ? w.liabilities / w.assets : null,
    liquidity: liquidity(ledger, today),
    month,
    budget: monthBudget(ledger, today),
    savingRate: month.income > 0 ? month.net / month.income : null,
    selfShare: recent.income > 0 ? self / recent.income : null
  }
}

// 每月末的净资产，从记账起点所在月份到本月，最多 12 个月。
export function netWorthSeries(ledger, today, limit = 12) {
  const dates = ledger.entries.map(e => e.date)
  if (ledger.startDate) dates.push(ledger.startDate)
  if (!dates.length) return []
  let month = monthOf(dates.sort()[0])
  const current = monthOf(today)
  const months = []
  while (month <= current) {
    months.push(month)
    month = addMonths(month, 1)
  }
  return months.slice(-limit).map(m => {
    const end = m === current ? today : `${m}-${pad(daysInMonth(m))}`
    return { month: m, net: worth(ledger, end).net }
  })
}

// 按日期分组的流水，最新在前；同一天内按录入先后倒序。
export function groupByDay(entries) {
  const days = new Map()
  for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))) {
    if (!days.has(e.date)) days.set(e.date, [])
    days.get(e.date).push(e)
  }
  return [...days].map(([date, list]) => ({
    date,
    list,
    expense: list.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0),
    income: list.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  }))
}
