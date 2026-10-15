import { html, vars, pct } from '../core/html.js'
import { addMonths, daysInMonth, formatMonth, formatMonthDay, formatDot, weekdayShort, monthOf, pad, isValidKey } from '../core/dates.js'
import { yuan, parseAmount, amountInput } from '../core/money.js'
import { uid } from '../core/store.js'
import {
  ACCOUNT_KINDS, BUCKETS, POLICY_TYPES, INCOME_LEVELS, STABILITY, SOURCE_GROUPS,
  balances, health, transferKind, summarizeMonth, entriesOfMonth, groupByDay, fixedTotal, plansMonthly, netWorthSeries,
  liquidity, stableNeed, insurance, nextStep, allocate, monthBudget, livingHints
} from '../domain/ledger.js'
import { icon } from '../ui/icons.js'
import { pageHead, segmented, empty, stat, field, sheetHead, sheetActions, options, meter } from '../ui/parts.js'
import { entrySheet, accountOptions } from '../ui/shared.js'

const TABS = [
  { id: 'flow', name: '流水' },
  { id: 'cashflow', name: '现金流' },
  { id: 'buckets', name: '四笔钱' },
  { id: 'balance', name: '资产负债' }
]
const LEGACY = { month: 'cashflow', setup: 'balance' }
const FREQS = [
  { id: 'monthly', name: '每月' },
  { id: 'biweekly', name: '每两周' },
  { id: 'weekly', name: '每周' }
]
const MONTH_CHOICES = [1, 2, 3, 4, 6, 9, 12].map(n => ({ id: n, name: `${n} 个月` }))
// 支出类别的固定配色序列，按标签顺序取，保证同一标签永远同色。
const PALETTE = ['blue', 'violet', 'green', 'orange', 'apricot', 'amber', 'rose', 'gray']

function route(ctx) {
  const [raw, month] = ctx.params
  const tab = LEGACY[raw] || raw
  return { tab: TABS.some(t => t.id === tab) ? tab : 'flow', month: /^\d{4}-\d{2}$/.test(month || '') ? month : monthOf(ctx.today) }
}

const toneOf = (ledger, catId) => PALETTE[Math.max(0, ledger.categories.findIndex(c => c.id === catId)) % PALETTE.length]
const streamTone = (ledger, id) => PALETTE[(ledger.streams.findIndex(s => s.id === id) + 2) % PALETTE.length]
const nameOf = (list, id, fallback = '未分类') => list.find(x => x.id === id)?.name || fallback
const percent = x => `${Math.round(x * 100)}%`
const monthsText = n => String(Number(n.toFixed(1)))
const owed = (account, balance) => (account.kind === 'debt' ? -balance : balance)

function looseMoney(text) {
  const t = String(text || '').trim()
  if (!t || /^0+(\.0+)?$/.test(t)) return 0
  return parseAmount(t)
}

function monthNav(tab, month, today) {
  const thisMonth = monthOf(today)
  return html`<div class="monthnav">
    <a class="icon-btn" href="#/ledger/${tab}/${addMonths(month, -1)}" aria-label="上个月">${icon('left')}</a>
    <span class="monthnav-label">${formatMonth(month)}</span>
    <a class="icon-btn ${month >= thisMonth ? 'is-disabled' : ''}" href="#/ledger/${tab}/${addMonths(month, 1)}" aria-label="下个月">${icon('right')}</a>
    ${month !== thisMonth ? html`<a class="chip chip-return" href="#/ledger/${tab}">回到本月</a>` : ''}
  </div>`
}

// ---------- 流水 ----------
function entryRow(ledger, e) {
  let name
  const sub = []
  if (e.type === 'expense') name = nameOf(ledger.categories, e.category)
  else if (e.type === 'income') name = nameOf(ledger.streams, e.stream, '收入')
  else if (e.type === 'transfer') {
    name = transferKind(ledger, e).name
    sub.push(`${nameOf(ledger.accounts, e.account)} → ${nameOf(ledger.accounts, e.to)}`)
  } else name = `核对 · ${nameOf(ledger.accounts, e.account)}`
  if (e.note) sub.push(e.note)
  if (e.type === 'expense' || e.type === 'income') sub.push(nameOf(ledger.accounts, e.account))
  const amount = e.type === 'expense' ? yuan(-e.amount) : e.type === 'transfer' ? yuan(e.amount) : yuan(e.amount, { sign: true })
  const tone = e.type === 'expense' ? toneOf(ledger, e.category) : e.type === 'income' ? streamTone(ledger, e.stream) : 'gray'
  return html`<li><button class="entry" data-action="${e.type === 'adjust' ? 'delete-adjust' : 'edit-entry'}" data-id="${e.id}">
    <span class="entry-dot" data-tone="${tone}" data-type="${e.type}"></span>
    <span class="entry-main"><span class="entry-name">${name}</span>${sub.length ? html`<span class="entry-sub">${sub.join(' · ')}</span>` : ''}</span>
    <span class="entry-amount is-${e.type}">${amount}</span>
  </button></li>`
}

function flow(ctx, month) {
  const { ledger } = ctx.state
  const days = groupByDay(entriesOfMonth(ledger, month))
  if (!days.length)
    return empty(
      month === monthOf(ctx.today) ? '这个月还没有记账' : '这个月没有记录',
      '每天花几十秒，知道钱从哪里来、到哪里去。记错了点开那一笔就能改。',
      html`<button class="btn primary" data-action="add-entry">${icon('plus')}记第一笔</button>`
    )
  return html`<p class="muted small flow-hint">点开任意一笔可以修改或删除；刚做的改动，提示条上有“撤销”。</p>
    <div class="flow">${days.map(
      d => html`<section class="flow-day">
        <header class="flow-day-head"><span>${formatMonthDay(d.date)} <span class="muted">${weekdayShort(d.date)}</span></span><span class="muted">${d.expense ? `支出 ${yuan(d.expense)}` : ''}${d.expense && d.income ? ' · ' : ''}${d.income ? `收入 ${yuan(d.income)}` : ''}</span></header>
        <ul class="entries">${d.list.map(e => entryRow(ledger, e))}</ul>
      </section>`
    )}</div>`
}

// ---------- 现金流 ----------
function legendList(items, total) {
  return html`<ul class="legend-list">${items.map(
    i => html`<li><span class="legend-name"><i data-tone="${i.tone}"></i>${i.name}</span><span class="legend-bar"><b data-tone="${i.tone}" data-vars="${vars({ w: pct(i.amount, items[0].amount) })}"></b></span><span class="legend-value">${yuan(i.amount)}<span class="muted"> ${Math.round((i.amount / total) * 100)}%</span></span></li>`
  )}</ul>`
}

const FLOW_ROWS = [
  { id: 'stable', name: '转入稳钱', sign: 1 },
  { id: 'long', name: '转入长钱', sign: 1 },
  { id: 'repay', name: '还款', sign: 1 },
  { id: 'back', name: '取回活钱', sign: -1 },
  { id: 'borrow', name: '借入', sign: -1 }
]

// 本月可支配：收入 − 固定开销 = 能自由花的；再减去已花的，就是还剩多少、每天约多少。
function budgetCard(ctx) {
  const b = monthBudget(ctx.state.ledger, ctx.today)
  if (!b.known)
    return html`<section class="card span-2"><div class="card-head"><h2 class="card-title">本月可支配</h2></div>
      <p class="muted">在「资产负债 → 收入来源」里给“父母 · 常规生活费”填上每月金额（稳定性选“稳定”），这里就会算出：收入 − 固定开销 = 每月真正能自由花的钱。</p></section>`
  return html`<section class="card span-2 budget">
    <div class="card-head"><h2 class="card-title">本月可支配</h2><span class="card-hint">固定开销先扣掉，剩下的才是能自由花的</span></div>
    <div class="budget-eq">
      <span><small>本月收入</small><b>${yuan(b.income)}</b>${b.pending ? html`<em>含未到账 ${yuan(b.pending)}</em>` : ''}</span>
      <i>−</i>
      <span><small>固定开销</small><b>${yuan(b.fixed)}</b>${b.fixedUnpaid ? html`<em>还没付 ${yuan(b.fixedUnpaid)}</em>` : ''}</span>
      <i>=</i>
      <span><small>可自由支配</small><b>${yuan(b.disposable)}</b></span>
    </div>
    ${meter(Math.max(0, b.flexibleSpent), Math.max(b.disposable, 1), b.remaining < 0 ? 'over' : '')}
    <p class="budget-line">已花 ${yuan(b.flexibleSpent)} · ${b.remaining >= 0 ? html`还剩 <b>${yuan(b.remaining)}</b>，本月还有 ${b.daysLeft} 天，每天约 <b>${yuan(Math.floor(b.perDay / 100) * 100)}</b>` : html`超出 <b>${yuan(-b.remaining)}</b>，会用到之前攒下的活钱`}</p>
  </section>`
}

function cashflow(ctx, month) {
  const { ledger } = ctx.state
  const sum = summarizeMonth(ledger, month)
  const isThisMonth = month === monthOf(ctx.today)
  if (!sum.count) return html`${isThisMonth ? html`<div class="report-grid">${budgetCard(ctx)}</div>` : ''}${empty('这个月还没有可分析的记录', '记上几笔之后，这里会画出钱的来路和去处。')}`
  const sources = sum.bySource.map(s => ({ name: nameOf(ledger.streams, s.id, '收入'), amount: s.amount, tone: streamTone(ledger, s.id) }))
  const cats = sum.byCategory.map(c => ({ name: nameOf(ledger.categories, c.id), amount: c.amount, tone: toneOf(ledger, c.id) }))
  const self = sum.byGroup.find(g => g.id === 'self')?.amount || 0
  const moves = FLOW_ROWS.filter(r => sum.flows[r.id])
  const n = daysInMonth(month)
  const daily = Array.from({ length: n }, (_, i) => {
    const key = `${month}-${pad(i + 1)}`
    return { key, value: ledger.entries.filter(e => e.date === key && e.type === 'expense').reduce((s, e) => s + e.amount, 0) }
  })
  const peak = Math.max(...daily.map(d => d.value), 1)
  return html`
    <div class="report-top">
      ${stat('收入', yuan(sum.income))}
      ${stat('支出', yuan(sum.expense))}
      ${stat('结余', yuan(sum.net, { sign: true }), sum.income ? `储蓄率 ${percent(sum.net / sum.income)}` : '收入 − 支出')}
    </div>
    <div class="report-grid">
      ${isThisMonth ? budgetCard(ctx) : ''}
      <section class="card">
        <div class="card-head"><h2 class="card-title">钱从哪里来</h2>${sum.income ? html`<span class="card-hint">自己赚的占 ${percent(self / sum.income)}</span>` : ''}</div>
        ${sum.income ? html`<div class="stack tall">${sources.map(s => html`<i data-tone="${s.tone}" data-vars="${vars({ w: pct(s.amount, sum.income) })}"></i>`)}</div>${legendList(sources, sum.income)}` : html`<p class="muted">这个月还没有收入记录。</p>`}
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">钱去了哪里</h2></div>
        ${sum.expense ? html`<div class="stack tall">${cats.map(c => html`<i data-tone="${c.tone}" data-vars="${vars({ w: pct(c.amount, sum.expense) })}"></i>`)}</div>${legendList(cats, sum.expense)}` : html`<p class="muted">这个月还没有支出记录。</p>`}
      </section>
      <section class="card span-2">
        <div class="card-head"><h2 class="card-title">每天的支出</h2><span class="card-hint">最高一天 ${yuan(peak === 1 ? 0 : peak)}</span></div>
        <div class="columns no-swipe">${daily.map(d => html`<span class="column ${d.key === ctx.today ? 'is-today' : ''} ${d.key > ctx.today ? 'is-future' : ''}" title="${formatMonthDay(d.key)} ${yuan(d.value)}"><i data-vars="${vars({ h: pct(d.value, peak) })}"></i></span>`)}</div>
        <div class="columns-scale"><span>1日</span><span>${Math.ceil(n / 2)}日</span><span>${n}日</span></div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">钱换了个地方放</h2><span class="card-hint">不算收入，也不算支出</span></div>
        ${moves.length
          ? html`<ul class="rows">${moves.map(r => html`<li class="row"><span class="row-main static"><span class="row-name">${r.name}</span></span><span class="row-value">${r.sign > 0 ? '' : '−'}${yuan(sum.flows[r.id])}</span></li>`)}</ul>`
          : html`<p class="muted">这个月没有在四笔钱之间挪动，也没有还款。</p>`}
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">收入的层级</h2></div>
        ${sum.income ? html`<ul class="levels">${INCOME_LEVELS.map(l => {
          const amount = sum.byLevel.find(x => Number(x.id) === l.id)?.amount || 0
          return html`<li class="${amount ? '' : 'is-zero'}"><span class="level-no">${l.id}</span><span class="level-text"><b>${l.name}</b><span class="muted">${l.hint}</span></span><span class="level-value">${amount ? yuan(amount) : '—'}</span></li>`
        })}</ul>` : html`<p class="muted">有收入记录后，这里显示每一层各有多少。往上走一层，钱和时间的关系就松一点。</p>`}
      </section>
    </div>`
}

// ---------- 四笔钱 ----------
const STEP_TEXT = {
  'fill-cash': s => `现在只做一件事：攒活钱。离下限还差 ${yuan(s.gap)}，新的结余都先留在活钱里，保险、稳钱、长钱先不用管。`,
  'review-insurance': () => '活钱够了。下一步看看保障：你现在有哪些保险？学校医保、城乡居民医保、意外险都算，记下来心里有数。',
  'fill-stable': s => `活钱和保险都就位了。稳钱目标还差 ${yuan(s.gap)}：活钱超过下限的部分，可以用下面的“分一笔钱”挪过去。`,
  'move-long': s => `活钱比上限多出 ${yuan(s.gap)}，稳钱也够了。多出来的可以分给长钱，交给时间。`,
  steady: () => '四笔钱都在该在的位置。保持记账，每月看一眼就好。'
}

function rangeMeter(liq) {
  if (liq.status === 'unknown') return ''
  const scale = Math.max(liq.maxAmount * 1.25, liq.amount, 1)
  return html`<div class="range-meter" title="下限 ${liq.minMonths} 个月 · 上限 ${liq.maxMonths} 个月">
    <span class="range-band" data-vars="${vars({ x: pct(liq.minAmount, scale), w: pct(liq.maxAmount - liq.minAmount, scale) })}"></span>
    <i class="range-fill is-${liq.status}" data-vars="${vars({ w: pct(liq.amount, scale) })}"></i>
  </div>
  <div class="range-scale"><span data-vars="${vars({ x: pct(liq.minAmount, scale) })}">${liq.minMonths} 个月</span><span data-vars="${vars({ x: pct(liq.maxAmount, scale) })}">${liq.maxMonths} 个月</span></div>`
}

function bucketCard(bucket, body, active) {
  return html`<section class="bucket ${active ? 'is-next' : ''}" data-bucket="${bucket.id}">
    <header class="bucket-head"><span class="bucket-no">${bucket.no}</span><div><h3 class="bucket-name">${bucket.name}</h3><p class="bucket-purpose">${bucket.purpose}</p></div></header>
    ${body}
  </section>`
}

function allocationRows(ctx, amount) {
  const { ledger } = ctx.state
  const plan = allocate(ledger, ctx.today, amount)
  const liq = liquidity(ledger, ctx.today)
  const stableAccounts = ledger.accounts.filter(a => a.kind === 'stable')
  const longAccounts = ledger.accounts.filter(a => a.kind === 'long')
  return html`<div class="alloc-rows">
    <div class="alloc-row"><span class="alloc-label"><b>留在活钱</b><small>${liq.status === 'unknown' ? '还不知道活钱下限，先都留着' : plan.keep ? '保证活钱不低于下限' : '活钱已经够了'}</small></span><span class="alloc-value">${yuan(plan.keep)}</span></div>
    <label class="alloc-row"><span class="alloc-label"><b>转入稳钱</b><small>${stableNeed(ledger).gap ? `稳钱目标还差 ${yuan(stableNeed(ledger).gap)}` : stableNeed(ledger).target ? '稳钱目标已备齐' : '还没有稳钱目标'}</small></span><input name="stable" class="input" inputmode="decimal" value="${amountInput(plan.stable)}" placeholder="0"><select name="stableTo" class="input">${options(stableAccounts, stableAccounts[0]?.id)}</select></label>
    <label class="alloc-row"><span class="alloc-label"><b>转入长钱</b><small>剩下的交给时间</small></span><input name="long" class="input" inputmode="decimal" value="${amountInput(plan.long)}" placeholder="0"><select name="longTo" class="input">${options(longAccounts, longAccounts[0]?.id)}</select></label>
  </div>`
}

// 四笔钱怎么用：三步，走到哪一步就亮哪一步。
const GUIDE = [
  ['定下每月生活费', '活钱该放多少，就按它算：3–6 个月的生活费。'],
  ['把活钱攒到下限', '照常记账就好，结余自然留在活钱里。'],
  ['多出来的再分', '活钱够了，再有结余就来「分一笔钱」：先补稳钱目标，剩下的给长钱。']
]

function guide(stage) {
  return html`<ol class="buckets-guide">${GUIDE.map(([title, text], i) => html`<li class="${i < stage ? 'is-done' : i === stage ? 'is-now' : ''}">
    <span class="guide-no">${i < stage ? icon('check') : i + 1}</span><span class="guide-text"><b>${title}</b><small>${text}</small></span>
  </li>`)}</ol>`
}

// 第一步：就地填每月生活费，不用翻到页面底部。
function livingStep(ctx, liq) {
  const hints = livingHints(ctx.state.ledger, ctx.today)
  return html`<section class="next-step">
    <span class="next-step-label">下一步</span>
    <div class="next-step-body">
      <p><b>你每月大概花多少钱？</b>不用很准：吃饭、话费、日用、交通加起来估个整数就行，以后随时能改。</p>
      <form data-form="living" class="living-quick">
        <input type="hidden" name="minMonths" value="${liq.minMonths}"><input type="hidden" name="maxMonths" value="${liq.maxMonths}">
        <input name="monthly" class="input" inputmode="decimal" autocomplete="off" placeholder="如 1500" aria-label="每月生活费">
        <button class="btn primary">定下来</button>
      </form>
      ${hints.length ? html`<div class="living-hints">${hints.map(h => html`<button type="button" class="chip" data-action="set-living" data-value="${h.amount}">${h.label} ${yuan(h.amount)}</button>`)}</div>` : ''}
      <p class="muted small">实在估不出来也没关系，照常记账，记满一个月会自动估算。</p>
    </div>
  </section>`
}

function saveLiving(ctx, living) {
  ctx.update(s => {
    s.ledger.living = living
  })
  ctx.toast(living.monthly ? `定好了：活钱放 ${yuan(living.monthly * living.minMonths)}–${yuan(living.monthly * living.maxMonths)}` : '已清空每月生活费，改按记账自动估算')
}

function buckets(ctx) {
  const { ledger } = ctx.state
  const liq = liquidity(ledger, ctx.today)
  const st = stableNeed(ledger)
  const ins = insurance(ledger)
  const w = health(ledger, ctx.today).worth
  const step = nextStep(ledger, ctx.today)
  const stepKey = step.kind === 'steady' ? step.kind : `${step.kind}-${step.bucket}`
  const stage = liq.status === 'unknown' ? 0 : liq.status === 'low' ? 1 : 2
  const month = summarizeMonth(ledger, monthOf(ctx.today))
  const suggested = liq.surplus || Math.max(0, month.net)
  const cashAccounts = ledger.accounts.filter(a => a.kind === 'cash')
  const row = (kind, item, main, sub, value) => html`<li class="row"><button class="row-main" data-action="record-edit" data-value="${kind}" data-id="${item.id}"><span class="row-name">${main}</span>${sub ? html`<span class="row-sub">${sub}</span>` : ''}</button><span class="row-value">${value}</span></li>`
  const statusText = {
    unknown: '先设定每月生活费',
    low: `正在攒，离下限还差 ${yuan(liq.gap)}`,
    ok: '在合适的范围里',
    high: `比上限多出 ${yuan(liq.surplus)}`
  }[liq.status]
  return html`
    <p class="buckets-intro">钱按用途分四笔，顺序是 <b>先活钱、再保险、再稳钱、最后长钱</b>：前一笔放够了，多出来的才往下流。</p>
    ${guide(stage)}
    ${step.kind === 'setup' ? livingStep(ctx, liq) : html`<section class="next-step"><span class="next-step-label">下一步</span><p>${STEP_TEXT[stepKey](step)}</p></section>`}
    <div class="buckets">
      ${bucketCard(BUCKETS[0], html`
        <p class="bucket-amount">${yuan(liq.amount)}</p>
        ${rangeMeter(liq)}
        <p class="bucket-status is-${liq.status}">${liq.months !== null ? `够 ${monthsText(liq.months)} 个月生活费 · ` : ''}${statusText}</p>
        ${liq.reserved ? html`<p class="bucket-note">其中 ${yuan(liq.reserved)} 要留给本月还没付的固定开销</p>` : ''}`, step.bucket === 'cash')}
      ${bucketCard(BUCKETS[1], html`
        <p class="bucket-amount">${ins.policies.length ? `${ins.policies.length} 份保障` : '还没记录'}</p>
        <div class="cover-chips">${POLICY_TYPES.filter(t => t.id !== 'other').map(t => html`<span class="cover-chip ${ins.covered.has(t.id) ? 'is-on' : ''}">${ins.covered.has(t.id) ? icon('check') : ''}${t.name}</span>`)}</div>
        <p class="bucket-status">${ins.premium ? `每年保费 ${yuan(ins.premium)}` : '保费从活钱里付，记成“保险”类支出'}</p>`, step.bucket === 'insurance')}
      ${bucketCard(BUCKETS[2], html`
        <p class="bucket-amount">${yuan(st.amount)}</p>
        ${st.target ? meter(Math.min(st.amount, st.target), st.target, 'gold') : ''}
        <p class="bucket-status">${st.target ? (st.gap ? `目标 ${yuan(st.target)}，还差 ${yuan(st.gap)}` : `目标 ${yuan(st.target)}，已备齐`) : '还没有 1–3 年内的用钱计划'}</p>`, step.bucket === 'stable')}
      ${bucketCard(BUCKETS[3], html`
        <p class="bucket-amount">${yuan(w.long)}</p>
        <p class="bucket-status">${plansMonthly(ledger) ? `定投每月 ${yuan(plansMonthly(ledger))}` : '还没有定投计划'}</p>
        <p class="bucket-note">至少 3 年、最好 5 年以上不动用</p>`, step.bucket === 'long')}
    </div>

    ${stage === 2 ? html`<form data-form="allocate" class="card allocate">
      <div class="card-head"><h2 class="card-title">分一笔钱</h2><span class="card-hint">按顺序给出建议，数字可以改</span></div>
      <div class="alloc-top">
        ${field('要分配的钱（现在在活钱里）', html`<input name="amount" class="input input-lg" inputmode="decimal" autocomplete="off" data-input="alloc-amount" value="${amountInput(suggested)}" placeholder="例如本月结余">`)}
        ${field('从哪个账户转出', html`<select name="from" class="input">${options(cashAccounts, cashAccounts[0]?.id)}</select>`)}
      </div>
      <div data-region="alloc-plan">${allocationRows(ctx, suggested)}</div>
      <div class="sheet-actions"><span class="muted small">会记成“转移”，可以撤销</span><span class="grow"></span><button class="btn primary">按这个分配</button></div>
    </form>` : ''}

    <div class="setup-grid">
      <section class="card">
        <div class="card-head"><h2 class="card-title">活钱规则</h2><span class="card-hint">活钱放够几个月的生活费</span></div>
        <form data-form="living" class="living-form">
          ${field('每月生活费', html`<input name="monthly" class="input" inputmode="decimal" autocomplete="off" value="${amountInput(ledger.living?.monthly || 0)}" placeholder="${liq.need.basis && liq.need.basis !== 'manual' ? amountInput(liq.need.amount) : '如 1500'}">`)}
          ${field('下限', html`<select name="minMonths" class="input">${options(MONTH_CHOICES, liq.minMonths)}</select>`)}
          ${field('上限', html`<select name="maxMonths" class="input">${options(MONTH_CHOICES, liq.maxMonths)}</select>`)}
          <button class="btn quiet">保存</button>
        </form>
        <p class="muted small">${{ manual: '用的是你填的每月生活费。', history: `没填时按最近 ${liq.need.months || 0} 个月的平均支出估算。`, fixed: '没填时按每月固定支出估算。', null: '没填也没有历史支出时，四笔钱暂时算不出活钱该放多少。' }[liq.need.basis]}有知有行建议活钱放 3–6 个月生活费。</p>
      </section>
      ${setupList('稳钱目标', '1–3 年内要花的钱', st.goals.map(g => row('goal', g, g.name, g.date ? `预计 ${formatDot(g.date)}` : '', yuan(g.amount))), 'goal', '目标', st.goals.length ? html`<p class="rows-total">合计 ${yuan(st.target)}。比如学费、电脑、考证报名、一次旅行。</p>` : html`<p class="muted small">比如下学期的学费、一台电脑、考证报名费。写下来，稳钱就有了目标。</p>`)}
      ${setupList('保险保障', '家庭保险', ins.policies.map(p => row('policy', p, p.name, [nameOf(POLICY_TYPES, p.type, ''), p.insured, p.coverage ? `保额 ${yuan(p.coverage)}` : '', p.renew ? `${formatDot(p.renew)} 续保` : ''].filter(Boolean).join(' · '), p.premium ? `${yuan(p.premium)}/年` : '')), 'policy', '保障', '')}
      ${setupList('定投（长钱）', '', ledger.plans.map(p => row('plan', p, p.name, `${nameOf(FREQS, p.freq)} · 转入${nameOf(ledger.accounts, p.account)}${p.active === false ? ' · 已暂停' : ''}`, yuan(p.amount))), 'plan', '定投', ledger.plans.length ? html`<p class="rows-total">折合每月 ${yuan(plansMonthly(ledger))}。每次扣款用“转移”记一笔，从活钱转入长钱账户。</p>` : '')}
    </div>`
}

// ---------- 资产负债 ----------
function healthItem(label, value, sub, extra = '', cls = '') {
  return html`<div class="health-item ${cls}"><span class="stat-label">${label}</span><span class="health-value">${value}</span>${sub ? html`<span class="stat-sub">${sub}</span>` : ''}${extra}</div>`
}

function accountRow(account, balance) {
  return html`<li class="row">
    <button class="row-main" data-action="record-edit" data-value="account" data-id="${account.id}"><span class="row-name">${account.name}${account.unverified ? html` <span class="tag">待核实</span>` : ''}</span></button>
    <span class="row-value">${yuan(owed(account, balance))}</span>
    <button class="btn quiet sm" data-action="calibrate" data-id="${account.id}" title="和实际余额对一下，差额记为今天的“核对”">核对</button>
  </li>`
}

function setupList(title, hint, rows, addKind, addLabel, footer = '') {
  return html`<section class="card">
    <div class="card-head"><h2 class="card-title">${title}</h2>${hint ? html`<span class="card-hint">${hint}</span>` : ''}<span class="grow"></span><button class="btn quiet sm" data-action="record-new" data-value="${addKind}">${icon('plus')}${addLabel}</button></div>
    ${rows.length ? html`<ul class="rows">${rows}</ul>` : html`<p class="muted">还没有。</p>`}
    ${footer}
  </section>`
}

function balanceSheet(ctx) {
  const { ledger } = ctx.state
  const h = health(ledger, ctx.today)
  const w = h.worth
  const liq = h.liquidity
  const debts = ledger.accounts.filter(a => a.kind === 'debt')
  const groups = ACCOUNT_KINDS.filter(k => k.id !== 'debt').map(k => ({ kind: k, list: ledger.accounts.filter(a => a.kind === k.id), total: w[k.id] }))
  const series = netWorthSeries(ledger, ctx.today)
  const peak = Math.max(...series.map(s => Math.abs(s.net)), 1)
  const row = (kind, item, main, sub, value) => html`<li class="row"><button class="row-main" data-action="record-edit" data-value="${kind}" data-id="${item.id}"><span class="row-name">${main}</span>${sub ? html`<span class="row-sub">${sub}</span>` : ''}</button><span class="row-value">${value}</span></li>`
  return html`<div class="setup-grid">
    <section class="card span-2">
      <div class="card-head"><h2 class="card-title">财务体检</h2><span class="card-hint">资产负债看存量，现金流看流量</span></div>
      <div class="health-grid">
        ${healthItem('净资产', yuan(w.net), `资产 ${yuan(w.assets)} − 负债 ${yuan(w.liabilities)}`)}
        ${w.liabilities > 0
          ? healthItem('负债', yuan(w.liabilities), h.debtRatio !== null ? `负债率 ${percent(h.debtRatio)}（负债 ÷ 资产）` : '')
          : healthItem('负债', html`${icon('check')}零负债`, '没有欠任何人的钱', '', 'is-clear')}
        ${healthItem('活钱', liq.months !== null ? `${monthsText(liq.months)} 个月` : '—', liq.months !== null ? `够几个月生活费 · 目标 ${liq.minMonths}–${liq.maxMonths} 个月` : '设定每月生活费后可算', liq.months !== null ? meter(Math.min(liq.months, liq.maxMonths), liq.maxMonths, 'gold') : '')}
        ${healthItem('本月储蓄率', h.savingRate !== null ? percent(h.savingRate) : '—', '结余 ÷ 收入')}
        ${healthItem('自己赚的占比', h.selfShare !== null ? percent(h.selfShare) : '—', '近三个月的收入里')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="card-title">资产</h2><span class="card-hint">${yuan(w.assets)}</span><span class="grow"></span><button class="btn quiet sm" data-action="opening">设置起点</button><button class="btn quiet sm" data-action="record-new" data-value="account">${icon('plus')}账户</button></div>
      ${groups.map(g => html`<div class="asset-group">
        <div class="asset-group-head"><span><b>${g.kind.name}</b><span class="muted small"> · ${g.kind.hint}</span></span><span class="asset-total">${yuan(g.total)}</span></div>
        ${g.list.length ? html`<ul class="rows">${g.list.map(a => accountRow(a, w.balances[a.id] || 0))}</ul>` : html`<p class="muted small">还没有${g.kind.name}账户。</p>`}
      </div>`)}
      <p class="rows-total">“设置起点”改的是各账户开始记账时的金额，不产生流水；“核对”是把账面和此刻的实际余额对齐，差额记为当天的一笔。</p>
    </section>

    <div class="stack-cards">
      <section class="card">
        <div class="card-head"><h2 class="card-title">负债</h2>${debts.length ? html`<span class="card-hint">${yuan(w.liabilities)}</span>` : ''}<span class="grow"></span><button class="btn quiet sm" data-action="debt-new">${icon('plus')}负债</button></div>
        ${debts.length
          ? html`<ul class="rows">${debts.map(a => accountRow(a, w.balances[a.id] || 0))}</ul><p class="rows-total">还款用“记一笔 → 转移”，从活钱转到负债账户；用花呗或信用卡消费时，支出的账户选它。</p>`
          : html`<div class="zero-debt">${icon('check')}<div><b>零负债</b><p class="muted small">花呗、信用卡、网贷、助学贷款、欠朋友的钱都算负债。哪天有了，就把它加进来，财务体检会算出负债率。</p></div></div>`}
      </section>
      ${series.length >= 2
        ? html`<section class="card">
            <div class="card-head"><h2 class="card-title">净资产走势</h2><span class="card-hint">每月末</span></div>
            <div class="columns no-swipe">${series.map(s => html`<span class="column ${s.month === monthOf(ctx.today) ? 'is-today' : ''}" title="${formatMonth(s.month)} ${yuan(s.net)}"><i data-vars="${vars({ h: pct(Math.max(0, s.net), peak) })}"></i></span>`)}</div>
            <div class="columns-scale"><span>${formatMonth(series[0].month)}</span><span>${formatMonth(series[series.length - 1].month)}</span></div>
          </section>`
        : ''}
    </div>

    ${setupList('每月固定支出', '会先从可支配里扣掉', ledger.fixed.map(f => row('fixed', f, f.name, `${f.day ? `每月 ${f.day} 日 · ` : ''}${nameOf(ledger.categories, f.category, '')}`, yuan(f.amount))), 'fixed', '固定支出', ledger.fixed.length ? html`<p class="rows-total">合计 ${yuan(fixedTotal(ledger))} / 月。记账时选对应的标签，系统就知道这笔已经付了。</p>` : '')}
    ${setupList('收入来源', '稳定性与层级', ledger.streams.map(s => row('stream', s, s.name, `${nameOf(SOURCE_GROUPS, s.group)} · ${nameOf(STABILITY, s.stability)} · 第 ${s.level} 层：${nameOf(INCOME_LEVELS, s.level)}`, s.monthly ? `约 ${yuan(s.monthly)}/月` : '')), 'stream', '来源', html`<p class="rows-total">稳定且填了每月金额的来源，会计入“本月可支配”（还没到账也算）。</p>`)}
    ${setupList('支出标签', '', ledger.categories.map(c => row('category', c, c.name, c.hint || '', '')), 'category', '标签')}
  </div>`
}

// ---------- 设置记账起点（可以反复改，带出上次填的数） ----------
function openingSheet(ctx) {
  const { ledger } = ctx.state
  ctx.openSheet(html`<form data-form="opening" class="sheet-form">
    ${sheetHead(ledger.openingDone ? '重新设置记账起点' : '设置记账起点', '填各账户在起点那天有多少钱。不确定的先估一个、勾上“待核实”，以后随时回来改，不用从头再填。')}
    ${field('起点日期', html`<input name="startDate" type="date" class="input" value="${ledger.startDate || ctx.today}">`)}
    ${ACCOUNT_KINDS.map(k => {
      const list = ledger.accounts.filter(a => a.kind === k.id)
      return html`<fieldset class="opening-group">
        <legend><b>${k.name}</b><span class="muted"> · ${k.id === 'debt' ? '欠款金额' : k.hint}</span></legend>
        ${list.length
          ? list.map(a => html`<div class="opening-row"><span>${a.name}</span><input name="acc:${a.id}" class="input" inputmode="decimal" autocomplete="off" value="${amountInput(owed(a, a.opening || 0))}" placeholder="0" aria-label="${a.name}"><label class="check"><input type="checkbox" name="unsure:${a.id}" ${a.unverified ? 'checked' : ''}><span>待核实</span></label></div>`)
          : html`<p class="muted small">${k.id === 'debt' ? '零负债。哪天有了，在「资产负债 → 负债」里添加。' : `没有${k.name}账户，可以在「资产负债」里添加。`}</p>`}
      </fieldset>`
    })}
    ${sheetActions(ledger.openingDone ? '保存修改' : '保存起点')}
  </form>`)
}

// ---------- 结构里的通用编辑面板 ----------
const SCHEMAS = {
  account: {
    title: '账户',
    list: l => l.accounts,
    fields: () => [
      { name: 'name', label: '名称', placeholder: '如 余额宝、花呗' },
      { name: 'kind', label: '属于哪笔钱', type: 'select', options: ACCOUNT_KINDS.map(k => ({ id: k.id, name: `${k.name}：${k.hint}` })) },
      { name: 'opening', label: '记账起点时的金额（负债填欠款）', type: 'money' },
      { name: 'unverified', label: '金额待核实', type: 'checkbox', off: true }
    ],
    used: (l, id) => l.entries.some(e => e.account === id || e.to === id) || l.plans.some(p => p.account === id)
  },
  fixed: {
    title: '固定支出',
    list: l => l.fixed,
    fields: l => [
      { name: 'name', label: '名称', placeholder: '如 话费' },
      { name: 'amount', label: '每月金额', type: 'money' },
      { name: 'day', label: '每月几号（可不填）', type: 'number' },
      { name: 'category', label: '对应标签', type: 'select', options: l.categories }
    ],
    used: () => false
  },
  stream: {
    title: '收入来源',
    list: l => l.streams,
    fields: () => [
      { name: 'name', label: '名称', placeholder: '如 家教' },
      { name: 'group', label: '来自', type: 'select', options: SOURCE_GROUPS },
      { name: 'level', label: '层级', type: 'select', options: INCOME_LEVELS.map(x => ({ id: x.id, name: `${x.id} · ${x.name}` })) },
      { name: 'stability', label: '稳定性', type: 'select', options: STABILITY },
      { name: 'monthly', label: '预计每月（可不填）', type: 'money' }
    ],
    used: (l, id) => l.entries.some(e => e.stream === id)
  },
  plan: {
    title: '定投',
    list: l => l.plans,
    fields: l => [
      { name: 'name', label: '名称', placeholder: '如 沪深300 指数基金' },
      { name: 'amount', label: '每期金额', type: 'money' },
      { name: 'freq', label: '频率', type: 'select', options: FREQS },
      { name: 'account', label: '转入账户', type: 'select', options: l.accounts.filter(a => a.kind === 'long') },
      { name: 'start', label: '开始日期', type: 'date' },
      { name: 'active', label: '进行中', type: 'checkbox' }
    ],
    used: () => false
  },
  goal: {
    title: '稳钱目标',
    list: l => l.stableGoals,
    fields: () => [
      { name: 'name', label: '要用钱的事', placeholder: '如 换一台电脑' },
      { name: 'amount', label: '需要多少', type: 'money' },
      { name: 'date', label: '大概什么时候用', type: 'date' }
    ],
    used: () => false
  },
  policy: {
    title: '保障',
    list: l => l.policies,
    fields: () => [
      { name: 'name', label: '名称', placeholder: '如 城乡居民医保、学平险' },
      { name: 'type', label: '类型', type: 'select', options: POLICY_TYPES },
      { name: 'insured', label: '保障谁', placeholder: '本人、爸爸、妈妈…' },
      { name: 'coverage', label: '保额（可不填）', type: 'money' },
      { name: 'premium', label: '每年保费（可不填）', type: 'money' },
      { name: 'renew', label: '续保 / 到期日（可不填）', type: 'date' }
    ],
    used: () => false
  },
  category: {
    title: '支出标签',
    list: l => l.categories,
    fields: () => [
      { name: 'name', label: '名称' },
      { name: 'hint', label: '说明（可不填）', placeholder: '如 奶茶、含糖饮料也算' }
    ],
    used: (l, id) => l.entries.some(e => e.category === id) || l.fixed.some(f => f.category === id)
  }
}

function recordSheet(ctx, kind, item, preset = {}) {
  const schema = SCHEMAS[kind]
  const { ledger } = ctx.state
  // 负债账户在数据里是负数，表单里按“欠款”正数显示。
  const value = item ? { ...item, opening: kind === 'account' ? owed(item, item.opening || 0) : item.opening } : { active: true, ...preset }
  const control = f => {
    const v = value[f.name]
    if (f.type === 'select') return html`<select name="${f.name}" class="input">${options(f.options, v)}</select>`
    if (f.type === 'money') return html`<input name="${f.name}" class="input" inputmode="decimal" autocomplete="off" value="${amountInput(v)}" placeholder="0">`
    if (f.type === 'number') return html`<input name="${f.name}" class="input" inputmode="numeric" autocomplete="off" value="${v || ''}">`
    if (f.type === 'date') return html`<input name="${f.name}" type="date" class="input" value="${v || ''}">`
    if (f.type === 'checkbox') return html`<input name="${f.name}" type="checkbox" class="switch" ${(f.off ? v === true : v !== false) ? 'checked' : ''}>`
    return html`<input name="${f.name}" class="input" maxlength="40" autocomplete="off" value="${v || ''}" placeholder="${f.placeholder || ''}">`
  }
  const canDelete = item && !schema.used(ledger, item.id)
  const title = kind === 'account' && value.kind === 'debt' ? '负债' : schema.title
  ctx.openSheet(html`<form data-form="record" class="sheet-form">
    ${sheetHead((item ? '编辑' : '新增') + title)}
    <input type="hidden" name="_kind" value="${kind}"><input type="hidden" name="_id" value="${item?.id || ''}">
    ${schema.fields(ledger).map(f => (f.type === 'checkbox' ? html`<label class="field field-inline"><span class="field-label">${f.label}</span>${control(f)}</label>` : field(f.label, control(f))))}
    ${sheetActions('保存', canDelete ? html`<button type="button" class="btn quiet danger" data-action="record-delete" data-value="${kind}" data-id="${item.id}">删除</button>` : item ? html`<span class="muted small">已被流水使用，不能删除</span>` : '')}
  </form>`)
}

export default {
  render(ctx) {
    const { ledger } = ctx.state
    const { tab, month } = route(ctx)
    const h = health(ledger, ctx.today)
    const w = h.worth
    const liq = h.liquidity
    const b = h.budget
    const unsure = ledger.accounts.filter(a => a.unverified)
    return html`
      ${pageHead('账本', '四笔钱 · 资产负债看存量，现金流看流量', html`<button class="btn primary" data-action="add-entry">${icon('plus')}记一笔</button>`)}
      <section class="money-head">
        ${stat('净资产', yuan(w.net), `资产 ${yuan(w.assets)} · 负债 ${yuan(w.liabilities)}`)}
        ${stat('活钱', yuan(w.cash), liq.months !== null ? `够 ${monthsText(liq.months)} 个月 · 目标 ${liq.minMonths}–${liq.maxMonths} 个月` : '日常开销与应急')}
        ${stat('本月还能花', b.known ? yuan(Math.max(0, b.remaining)) : '—', b.known ? (b.remaining >= 0 ? `每天约 ${yuan(Math.floor(b.perDay / 100) * 100)} · 还有 ${b.daysLeft} 天` : `已超出 ${yuan(-b.remaining)}`) : '填上每月生活费来源后可算')}
        ${stat('本月现金流', yuan(h.month.net, { sign: true }), `收入 ${yuan(h.month.income)} · 支出 ${yuan(h.month.expense)}`)}
      </section>
      ${!ledger.openingDone
        ? html`<section class="card opening-card">
            <div><h2 class="card-title">第一步：设置记账起点</h2><p class="muted">原本剩下的钱也是你的资产。把各账户现在大概有多少填进去；不确定的先估一个、标“待核实”，之后随时能改。</p></div>
            <button class="btn primary" data-action="opening">设置起点</button>
          </section>`
        : unsure.length
          ? html`<p class="notice">${unsure.map(a => a.name).join('、')} 的金额待核实。弄清楚之后，到「资产负债 → 设置起点」改一下就行，不用重填别的。 <button class="link" data-action="opening">现在改</button></p>`
          : ''}
      <div class="tabs-row">
        ${segmented(TABS, tab, 'ledger-tab', '账本视图')}
        ${tab === 'flow' || tab === 'cashflow' ? monthNav(tab, month, ctx.today) : ''}
      </div>
      <div class="tab-body">
        ${tab === 'flow' ? flow(ctx, month) : tab === 'cashflow' ? cashflow(ctx, month) : tab === 'buckets' ? buckets(ctx) : balanceSheet(ctx)}
      </div>`
  },
  actions: {
    'ledger-tab': ({ ctx, value }) => {
      const { month } = route(ctx)
      const dated = value === 'flow' || value === 'cashflow'
      ctx.go(!dated ? `#/ledger/${value}` : month === monthOf(ctx.today) ? `#/ledger/${value}` : `#/ledger/${value}/${month}`, { replace: true })
    },
    'add-entry': ({ ctx }) => entrySheet(ctx, { date: ctx.today }),
    'set-living': ({ ctx, value }) => {
      const liq = liquidity(ctx.state.ledger, ctx.today)
      saveLiving(ctx, { monthly: Number(value), minMonths: liq.minMonths, maxMonths: liq.maxMonths })
    },
    opening: ({ ctx }) => openingSheet(ctx),
    'record-new': ({ ctx, value }) => recordSheet(ctx, value, null),
    'debt-new': ({ ctx }) => recordSheet(ctx, 'account', null, { kind: 'debt' }),
    'record-edit': ({ ctx, value, id }) => recordSheet(ctx, value, SCHEMAS[value].list(ctx.state.ledger).find(x => x.id === id)),
    'record-delete': ({ ctx, value, id }) => {
      ctx.closeSheet()
      ctx.undoable(`已删除${SCHEMAS[value].title}`, s => {
        const list = SCHEMAS[value].list(s.ledger)
        list.splice(list.findIndex(x => x.id === id), 1)
      })
    },
    calibrate: ({ ctx, id }) => {
      const account = ctx.state.ledger.accounts.find(a => a.id === id)
      const current = owed(account, balances(ctx.state.ledger)[id] || 0)
      const isDebt = account.kind === 'debt'
      ctx.openSheet(html`<form data-form="calibrate" class="sheet-form">
        ${sheetHead('核对余额', `${account.name} · 账面${isDebt ? '欠款' : '余额'} ${yuan(current)}`)}
        <input type="hidden" name="id" value="${id}">
        ${field(isDebt ? '实际欠款' : '此刻的实际余额', html`<input name="actual" class="input input-lg" inputmode="decimal" autocomplete="off" value="${amountInput(current)}" autofocus>`, '差额记成今天的一笔“核对”，不计入收入或支出。长钱账户可以用它更新市值。如果是起点就填错了，用“设置起点”改更合适。')}
        ${sheetActions('核对')}
      </form>`)
    },
    'delete-adjust': ({ ctx, id }) => {
      const entry = ctx.state.ledger.entries.find(e => e.id === id)
      ctx.openSheet(html`<div class="sheet-form">
        ${sheetHead('核对记录', `${formatMonthDay(entry.date)} · ${nameOf(ctx.state.ledger.accounts, entry.account)} · ${yuan(entry.amount, { sign: true })}`)}
        <p class="muted">核对只调整账面余额。删除后余额会回到核对前。</p>
        <div class="sheet-actions"><span class="grow"></span><button type="button" class="btn ghost" data-action="close-sheet">关闭</button><button type="button" class="btn danger" data-action="delete-entry" data-id="${id}">删除这条核对</button></div>
      </div>`)
    }
  },
  inputs: {
    'alloc-amount': ({ ctx, value }) => {
      const amount = looseMoney(value)
      if (amount === null) return
      ctx.patch('alloc-plan', allocationRows(ctx, amount))
    }
  },
  forms: {
    record: ({ data, ctx }) => {
      const kind = data._kind
      const schema = SCHEMAS[kind]
      const next = {}
      for (const f of schema.fields(ctx.state.ledger)) {
        const raw = data[f.name]
        if (f.type === 'money') {
          const cents = looseMoney(raw)
          if (cents === null) return ctx.toast(`${f.label}格式不对`)
          next[f.name] = cents
        } else if (f.type === 'number') {
          const n = raw ? Number(raw) : null
          if (raw && !(Number.isInteger(n) && n >= 1 && n <= 31)) return ctx.toast('日期写 1 到 31')
          next[f.name] = n
        } else if (f.type === 'checkbox') next[f.name] = raw === 'on'
        else if (f.name === 'level') next[f.name] = Number(raw)
        else if (f.type === 'date') next[f.name] = isValidKey(raw) ? raw : ''
        else next[f.name] = (raw || '').trim()
      }
      if (!next.name) return ctx.toast('名称不能为空')
      if (['fixed', 'plan', 'goal'].includes(kind) && !next.amount) return ctx.toast('金额要大于 0')
      if (kind === 'account' && next.kind === 'debt') next.opening = -next.opening
      ctx.update(s => {
        const list = schema.list(s.ledger)
        const i = list.findIndex(x => x.id === data._id)
        if (i >= 0) list[i] = { ...list[i], ...next }
        else list.push({ id: uid(), ...next })
      })
      ctx.closeSheet()
      ctx.toast('已保存')
    },
    calibrate: ({ data, ctx }) => {
      const actual = looseMoney(data.actual)
      if (actual === null) return ctx.toast('金额格式不对')
      const account = ctx.state.ledger.accounts.find(a => a.id === data.id)
      const target = account.kind === 'debt' ? -actual : actual
      const delta = target - (balances(ctx.state.ledger)[data.id] || 0)
      ctx.closeSheet()
      ctx.update(s => {
        const a = s.ledger.accounts.find(x => x.id === data.id)
        delete a.unverified
        if (delta) s.ledger.entries.push({ id: uid(), type: 'adjust', amount: delta, account: data.id, date: ctx.today, note: '', createdAt: new Date().toISOString() })
      })
      ctx.toast(delta ? `已核对 · ${yuan(delta, { sign: true })}` : '一致，已标为核实')
    },
    // 起点可以反复改：每次都带出上次填的数，只改动过的账户才变。
    opening: ({ data, ctx }) => {
      const { ledger } = ctx.state
      const next = []
      for (const account of ledger.accounts) {
        const raw = data[`acc:${account.id}`]
        if (raw === undefined) continue
        const amount = looseMoney(raw)
        if (amount === null) return ctx.toast(`「${account.name}」的金额格式不对`)
        next.push({ id: account.id, opening: account.kind === 'debt' ? -amount : amount, unverified: data[`unsure:${account.id}`] === 'on' })
      }
      const first = !ledger.openingDone
      ctx.update(s => {
        for (const n of next) {
          const a = s.ledger.accounts.find(x => x.id === n.id)
          a.opening = n.opening
          if (n.unverified) a.unverified = true
          else delete a.unverified
        }
        s.ledger.openingDone = true
        s.ledger.startDate = isValidKey(data.startDate) ? data.startDate : s.ledger.startDate || ctx.today
      })
      ctx.closeSheet()
      const unsure = next.filter(n => n.unverified).length
      ctx.toast(`${first ? '起点设好了' : '起点已更新'}${unsure ? ` · ${unsure} 个待核实` : ''}`)
    },
    living: ({ data, ctx }) => {
      const monthly = looseMoney(data.monthly)
      if (monthly === null) return ctx.toast('金额格式不对')
      const minMonths = Number(data.minMonths) || 3
      const maxMonths = Math.max(minMonths, Number(data.maxMonths) || 6)
      saveLiving(ctx, { monthly, minMonths, maxMonths })
    },
    allocate: ({ data, ctx }) => {
      const parts = [
        { amount: looseMoney(data.stable), to: data.stableTo, name: '稳钱' },
        { amount: looseMoney(data.long), to: data.longTo, name: '长钱' }
      ]
      if (parts.some(p => p.amount === null)) return ctx.toast('金额格式不对')
      const moves = parts.filter(p => p.amount > 0)
      if (!moves.length) return ctx.toast('没有要转出去的钱，留在活钱就好')
      if (moves.some(p => !p.to)) return ctx.toast('先在「资产负债」里添加稳钱或长钱账户')
      ctx.update(s => {
        for (const p of moves) s.ledger.entries.push({ id: uid(), type: 'transfer', amount: p.amount, account: data.from, to: p.to, date: ctx.today, note: '分一笔钱', createdAt: new Date().toISOString() })
      })
      ctx.toast(`已分配：${moves.map(p => `${p.name} ${yuan(p.amount)}`).join('，')}`)
    }
  }
}
