import { html, vars, pct } from '../core/html.js'
import { addDays, startOfWeek, hours, duration, formatMonthDay, formatDot, eachDay } from '../core/dates.js'
import { yuan } from '../core/money.js'
import { lifePosition } from '../domain/life.js'
import { balanceSheet } from '../domain/overview.js'
import { TIME_KINDS } from '../domain/timelog.js'
import { pageHead, segmented } from '../ui/parts.js'

const RANGES = [
  { id: 'week', name: '本周' },
  { id: '30', name: '近 30 天' },
  { id: 'month', name: '本月' },
  { id: 'life', name: '本辈子' }
]

function rangeOf(id, today, lives) {
  if (id === '30') return { from: addDays(today, -29), to: today }
  if (id === 'month') return { from: today.slice(0, 8) + '01', to: today }
  if (id === 'life') return { from: lifePosition(lives, today)?.life.start || addDays(today, -364), to: today }
  return { from: startOfWeek(today), to: today }
}

function card(no, title, nature, body) {
  return html`<section class="sheet-card" data-nature="${nature}">
    <header class="sheet-card-head"><span class="sheet-no">${String(no).padStart(2, '0')}</span><h2>${title}</h2></header>
    ${body}
  </section>`
}

// 每天一根柱；不满一周时补齐到七天，还没到的日子画成虚的。
function dayColumns(from, to, values, today) {
  const days = eachDay(from, to)
  if (days.length > 31) return ''
  if (days.length < 7) days.push(...eachDay(addDays(to, 1), addDays(from, 6)))
  const peak = Math.max(...days.map(d => values[d] || 0), 1)
  return html`<div class="columns small no-swipe">${days.map(d => html`<span class="column ${d === today ? 'is-today' : ''} ${d > today ? 'is-future' : ''}" title="${formatMonthDay(d)} ${values[d] ? duration(values[d]) : '无'}"><i data-vars="${vars({ h: pct(values[d] || 0, peak) })}"></i></span>`)}</div>`
}

export default {
  render(ctx) {
    const { state, today } = ctx
    const range = RANGES.some(r => r.id === ctx.params[0]) ? ctx.params[0] : 'week'
    const { from, to } = rangeOf(range, today, state.lives)
    const s = balanceSheet(state, from, to)
    const t = s.time
    const attentionValues = Object.fromEntries(s.attention.perDay.map(d => [d.date, d.value]))
    const self = s.money.byGroup.find(g => g.id === 'self')?.amount || 0
    const noLog = s.loggedDays === 0
    return html`
      ${pageHead('盘点', '人生资产负债表 · 注意力 > 时间 > 金钱')}
      <div class="tabs-row">
        ${segmented(RANGES, range, 'range', '盘点范围')}
        <span class="muted small">${formatDot(from)} – ${formatDot(to)} · ${s.days} 天，其中 ${s.loggedDays} 天有时间日志</span>
      </div>
      ${noLog ? html`<p class="notice">这段时间还没有时间日志。注意力、时间、身体三项会随着每晚的复盘慢慢丰满。</p>` : ''}
      <div class="balance">
        ${card(1, '注意力', 'debt', html`
          <p class="sheet-big">${s.attention.shortvideo ? html`${hours(s.attention.shortvideo)}<small> 小时短视频</small>` : html`0<small> 短视频</small>`}</p>
          <p class="sheet-line">${s.loggedDays ? `有记录的 ${s.loggedDays} 天里，${s.attention.clearDays} 天没碰短视频。` : '有了时间日志，这里会显示清醒的天数。'}</p>
          ${s.attention.shortvideo ? dayColumns(from, to, attentionValues, today) : ''}`)}
        ${card(2, '时间', 'asset', html`
          <p class="sheet-big">${hours(t.byKind.invest)}<small> 小时投资在自己身上</small></p>
          ${t.total ? html`<div class="stack tall">${TIME_KINDS.filter(k => t.byKind[k.id]).map(k => html`<i data-kind="${k.id}" data-vars="${vars({ w: pct(t.byKind[k.id], t.total) })}" title="${k.name}"></i>`)}</div>
          <ul class="kind-legend">${TIME_KINDS.map(k => html`<li data-kind="${k.id}" class="${t.byKind[k.id] ? '' : 'is-zero'}"><i></i><span>${k.name}</span><b>${hours(t.byKind[k.id])}h</b></li>`)}</ul>` : html`<p class="sheet-line">投资 · 交换 · 维持 · 自由 · 负债，五种时间的比例会画在这里。</p>`}`)}
        ${card(3, '金钱', 'asset', html`
          <p class="sheet-big">${yuan(s.money.worth.net)}<small> 净资产</small></p>
          <p class="sheet-line">${s.money.worth.liabilities ? `负债 ${yuan(s.money.worth.liabilities)}` : '零负债'} · 活钱 ${yuan(s.money.liquidity.amount)}${s.money.liquidity.months !== null ? `，够 ${Number(s.money.liquidity.months.toFixed(1))} 个月生活费` : ''} · 稳钱 ${yuan(s.money.worth.stable)} · 长钱 ${yuan(s.money.worth.long)}。</p>
          <p class="sheet-line">现金流：收入 ${yuan(s.money.income)}，支出 ${yuan(s.money.expense)}，结余 ${yuan(s.money.net, { sign: true })}。${s.money.income ? `自己赚的占 ${Math.round((self / s.money.income) * 100)}%。` : ''}</p>`)}
        ${card(4, '身体', 'asset', html`
          <p class="sheet-big">${hours(s.body.sport)}<small> 小时运动</small></p>
          <p class="sheet-line">${s.body.sportDays ? `${s.body.sportDays} 天动了起来。` : '还没有运动记录。'}${s.body.sleepDays ? `平均睡眠 ${hours(s.body.sleepAvg)} 小时（${s.body.sleepDays} 天有记录）。` : ''}</p>`)}
        ${card(5, '自学', 'asset', html`
          ${s.skill
            ? html`<p class="sheet-big">${hours(s.skill.inRange)}<small> 小时刻意练习</small></p><p class="sheet-line">「${s.skill.name}」累计 ${hours(s.skill.total)} 小时。<a href="#/skill">去修炼</a></p>`
            : html`<p class="sheet-big">—</p><p class="sheet-line">还没定下这辈子的技能。<a href="#/skill">去定下</a></p>`}`)}
        ${card(6, '积累', 'asset', html`
          <p class="sheet-big">${s.accumulate.usesInRange}<small> 次把读过的用上</small></p>
          <p class="sheet-line">感恩日记 ${s.accumulate.gratitudeDays} 天 · 新收录 ${s.accumulate.itemsAdded} 条。</p>
          <p class="sheet-line muted">累计：感恩 ${s.accumulate.gratitudeTotal} 天 · 藏书 ${s.accumulate.itemsTotal} 条 · 实践 ${s.accumulate.usesTotal} 次</p>`)}
      </div>
      <p class="muted small center">只和过去的自己比。没有记录的日子不算作“没做”，也不计入平均。</p>`
  },
  actions: {
    range: ({ ctx, value }) => ctx.go(value === 'week' ? '#/overview' : `#/overview/${value}`, { replace: true })
  }
}
