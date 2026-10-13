// 多个页面共用的面板：记一笔、记录练习、记一次实践。
import { html } from '../core/html.js'
import { parseAmount, amountInput, yuan } from '../core/money.js'
import { uid } from '../core/store.js'
import { isValidKey } from '../core/dates.js'
import { itemCode, itemTitle } from '../domain/library.js'
import { ACCOUNT_KINDS } from '../domain/ledger.js'
import { backupNow } from './backup.js'
import { sheetHead, sheetActions, field, options } from './parts.js'

// 账户下拉按类型分组：活钱 / 安全垫 / 投资 / 负债。
export function accountOptions(accounts, value) {
  return ACCOUNT_KINDS.map(k => {
    const list = accounts.filter(a => a.kind === k.id)
    return list.length ? html`<optgroup label="${k.name}">${options(list, value)}</optgroup>` : ''
  })
}

export const activeSkill = state => state.skills.find(s => s.active) || state.skills[state.skills.length - 1] || null

// ---------- 记一笔 ----------
export function entrySheet(ctx, { entry = null, date = ctx.today, type = 'expense' } = {}) {
  const { ledger } = ctx.state
  const e = entry || { type, date, account: ledger.accounts.find(a => a.kind === 'cash')?.id || ledger.accounts[0]?.id, category: 'meal', stream: ledger.streams[0]?.id }
  const radio = (name, value, label, checked, extra = '') => html`<label class="pick ${extra}"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`
  ctx.openSheet(html`<form data-form="entry" class="sheet-form entry-form">
    ${sheetHead(entry ? '修改这一笔' : '记一笔')}
    <input type="hidden" name="id" value="${entry?.id || ''}">
    <div class="pick-seg">
      ${radio('type', 'expense', '支出', e.type === 'expense')}
      ${radio('type', 'income', '收入', e.type === 'income')}
      ${radio('type', 'transfer', '转移', e.type === 'transfer')}
    </div>
    <label class="amount-field"><span>¥</span><input name="amount" class="amount-input" inputmode="decimal" autocomplete="off" placeholder="0" value="${amountInput(e.amount)}" autofocus></label>
    <fieldset class="picks only-expense"><legend>花在哪</legend>${ledger.categories.map(c => radio('category', c.id, c.name, e.category === c.id))}</fieldset>
    <fieldset class="picks only-income"><legend>从哪来</legend>${ledger.streams.map(s => radio('stream', s.id, s.name, e.stream === s.id))}</fieldset>
    <div class="field-row">
      ${field(html`<span class="only-transfer-inline">从</span><span class="hide-transfer-inline">账户</span>`, html`<select name="account" class="input">${accountOptions(ledger.accounts, e.account)}</select>`)}
      <span class="only-transfer">${field('到', html`<select name="to" class="input">${accountOptions(ledger.accounts, e.to || ledger.accounts.find(a => a.kind === 'stable')?.id)}</select>`)}</span>
      ${field('日期', html`<input name="date" type="date" class="input" value="${e.date}">`)}
    </div>
    <p class="only-transfer muted small">在活钱、稳钱、长钱之间挪钱，定投扣款、还花呗、向人借钱，都用“转移”记：钱只是换了个地方放，不算收入或支出。</p>
    ${field('备注', html`<input name="note" class="input" maxlength="80" autocomplete="off" value="${e.note || ''}" placeholder="可不填">`)}
    ${sheetActions(entry ? '保存' : '记下', entry ? html`<button type="button" class="btn quiet danger" data-action="delete-entry" data-id="${entry.id}">删除</button>` : '')}
  </form>`)
}

// ---------- 记录练习 ----------
export function practiceSheet(ctx, { date = ctx.today, minutes = '' } = {}) {
  const skill = activeSkill(ctx.state)
  if (!skill) {
    ctx.toast('先在“修炼”里定下这辈子要练的技能')
    return ctx.go('#/skill')
  }
  ctx.openSheet(html`<form data-form="practice" class="sheet-form">
    ${sheetHead('记录刻意练习', skill.name)}
    ${field('有效时长（分钟）', html`<input name="minutes" class="input input-lg" inputmode="numeric" autocomplete="off" value="${minutes}" placeholder="只记真正专注的时间" autofocus>`)}
    <div class="quick-row">${[25, 45, 60, 90, 120].map(m => html`<button type="button" class="chip" data-action="fill-minutes" data-value="${m}">${m}</button>`)}</div>
    <div class="field-row">
      ${field('日期', html`<input name="date" type="date" class="input" value="${date}">`)}
      ${field('练了什么', html`<input name="note" class="input" maxlength="80" autocomplete="off" placeholder="可不填">`)}
    </div>
    ${sheetActions('记入')}
  </form>`)
}

// ---------- 记一次实践 ----------
export function useSheet(ctx, item) {
  ctx.openSheet(html`<form data-form="use" class="sheet-form">
    ${sheetHead('用上了', itemCode(item))}
    <input type="hidden" name="itemId" value="${item.id}">
    <blockquote class="use-quote ${item.kind === 'fragment' ? '' : 'manual'}">${itemTitle(item)}</blockquote>
    ${field('它帮你解决了什么问题？', html`<textarea name="note" class="input" rows="3" maxlength="300" placeholder="一两句话，写给未来的自己" autofocus></textarea>`)}
    ${field('日期', html`<input name="date" type="date" class="input" value="${ctx.today}">`)}
    ${sheetActions('记一笔')}
  </form>`)
}

export const actions = {
  'backup-now': ({ ctx }) => backupNow(ctx),
  'add-entry': ({ ctx, value }) => entrySheet(ctx, { date: isValidKey(value) ? value : ctx.today }),
  'edit-entry': ({ ctx, id }) => {
    const entry = ctx.state.ledger.entries.find(e => e.id === id)
    if (entry) entrySheet(ctx, { entry })
  },
  'delete-entry': ({ ctx, id }) => {
    ctx.closeSheet()
    ctx.undoable('已删除这一笔', s => {
      s.ledger.entries = s.ledger.entries.filter(e => e.id !== id)
    })
  },
  'add-practice': ({ ctx, value, el }) => practiceSheet(ctx, { date: isValidKey(value) ? value : ctx.today, minutes: el.dataset.minutes || '' }),
  'fill-minutes': ({ el, value }) => {
    const input = el.closest('form').elements.minutes
    input.value = value
    input.focus()
  },
  'use-item': ({ ctx, id }) => {
    const item = ctx.state.library.items.find(i => i.id === id)
    if (item) useSheet(ctx, item)
  }
}

export const forms = {
  entry: ({ data, ctx }) => {
    const amount = parseAmount(data.amount)
    if (!amount) return ctx.toast('金额要大于 0，最多两位小数')
    if (!isValidKey(data.date)) return ctx.toast('日期不对')
    if (data.type === 'transfer' && data.account === data.to) return ctx.toast('转出和转入不能是同一个账户')
    const entry = {
      id: data.id || uid(),
      type: data.type,
      amount,
      account: data.account,
      date: data.date,
      note: data.note.trim()
    }
    if (data.type === 'expense') entry.category = data.category || 'other'
    if (data.type === 'income') entry.stream = data.stream
    if (data.type === 'transfer') entry.to = data.to
    ctx.update(s => {
      const list = s.ledger.entries
      const i = list.findIndex(e => e.id === entry.id)
      if (i >= 0) list[i] = { ...list[i], ...entry, category: entry.category, stream: entry.stream, to: entry.to }
      else list.push({ ...entry, createdAt: new Date().toISOString() })
    })
    ctx.closeSheet()
    ctx.toast(`${data.id ? '已保存' : '记下了'} · ${data.type === 'income' ? '+' : ''}${yuan(amount)}`)
  },
  practice: ({ data, ctx }) => {
    const minutes = Math.round(Number(data.minutes))
    if (!(minutes > 0 && minutes <= 1440)) return ctx.toast('时长写分钟数，比如 90')
    if (!isValidKey(data.date)) return ctx.toast('日期不对')
    const skill = activeSkill(ctx.state)
    ctx.update(s => {
      s.practice.push({ id: uid(), skillId: skill.id, date: data.date, minutes, note: data.note.trim() })
    })
    ctx.closeSheet()
    ctx.toast(`记入 ${minutes} 分钟 · 功不唐捐`)
  },
  use: ({ data, ctx }) => {
    if (!isValidKey(data.date)) return ctx.toast('日期不对')
    ctx.update(s => {
      s.library.uses.push({ id: uid(), itemId: data.itemId, date: data.date, note: data.note.trim() })
    })
    ctx.closeSheet()
    ctx.toast('记下了 · 读过的书开始生利息')
  }
}
