// 可直接阅读的完整档案：不需要这个网站，也能用记事本、Excel、看图软件读懂自己的记录。
// 同时附带 data.json 与附件索引，可以原样导回网站。几十年后网站不在了，档案依然可读。
import { formatFull, weekdayName, formatMonth, todayKey } from '../core/dates.js'
import { ACCOUNT_KINDS, balances, transferKind, POLICY_TYPES } from './ledger.js'
import { KIND_ORDER, KINDS, kindName, itemCode, itemTitle } from './library.js'
import { normalizeLives } from './life.js'
import { childrenOf, statusName } from './milestones.js'

const BOM = '﻿' // 让 Excel 认出 UTF-8，中文不乱码
const cell = v => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = rows => BOM + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
const money = cents => ((cents || 0) / 100).toFixed(2)
const nameOf = (list, id) => list.find(x => x.id === id)?.name || ''
export const safeName = name =>
  String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file'

function groupBy(list, keyOf) {
  const map = new Map()
  for (const x of list) {
    const k = keyOf(x)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(x)
  }
  return map
}

function ledgerFiles(state, out) {
  const { ledger } = state
  const typeName = { expense: '支出', income: '收入', transfer: '转移', adjust: '核对' }
  const byYear = groupBy([...ledger.entries].sort((a, b) => a.date.localeCompare(b.date)), e => e.date.slice(0, 4))
  for (const [year, list] of byYear) {
    out.push({
      path: `账本/流水-${year}.csv`,
      data: csv([
        ['日期', '类型', '金额', '分类或来源', '账户', '转入账户', '备注'],
        ...list.map(e => [
          e.date,
          e.type === 'transfer' ? transferKind(ledger, e).name : typeName[e.type],
          money(e.type === 'expense' ? -e.amount : e.amount),
          e.type === 'expense' ? nameOf(ledger.categories, e.category) : e.type === 'income' ? nameOf(ledger.streams, e.stream) : '',
          nameOf(ledger.accounts, e.account),
          e.to ? nameOf(ledger.accounts, e.to) : '',
          e.note || ''
        ])
      ])
    })
  }
  const bal = balances(ledger)
  out.push({
    path: '账本/账户.csv',
    data: csv([
      ['账户', '属于', '记账起点金额', '当前余额', '待核实'],
      ...ledger.accounts.map(a => [a.name, nameOf(ACCOUNT_KINDS, a.kind), money(a.kind === 'debt' ? -(a.opening || 0) : a.opening), money(a.kind === 'debt' ? -(bal[a.id] || 0) : bal[a.id]), a.unverified ? '是' : ''])
    ])
  })
  const lines = [`# 账本结构`, '', `记账起点：${ledger.startDate || '未设置'}`, '']
  lines.push('## 活钱规则', '', `每月生活费：${ledger.living?.monthly ? money(ledger.living.monthly) + ' 元' : '按历史支出估算'}；放够 ${ledger.living?.minMonths || 3}–${ledger.living?.maxMonths || 6} 个月`, '')
  lines.push('## 每月固定支出', '', ...(ledger.fixed.length ? ledger.fixed.map(f => `- ${f.name}：${money(f.amount)} 元${f.day ? `（每月 ${f.day} 日）` : ''}`) : ['（无）']), '')
  lines.push('## 收入来源', '', ...ledger.streams.map(s => `- ${s.name}${s.monthly ? `：约 ${money(s.monthly)} 元/月` : ''}`), '')
  lines.push('## 稳钱目标', '', ...((ledger.stableGoals || []).length ? ledger.stableGoals.map(g => `- ${g.name}：${money(g.amount)} 元${g.date ? `，预计 ${g.date}` : ''}`) : ['（无）']), '')
  lines.push('## 保险保障', '', ...((ledger.policies || []).length ? ledger.policies.map(p => `- ${p.name}（${nameOf(POLICY_TYPES, p.type)}${p.insured ? ` · ${p.insured}` : ''}）${p.coverage ? ` 保额 ${money(p.coverage)} 元` : ''}${p.premium ? ` 年缴 ${money(p.premium)} 元` : ''}${p.renew ? ` 续保 ${p.renew}` : ''}`) : ['（无）']), '')
  lines.push('## 定投', '', ...(ledger.plans.length ? ledger.plans.map(p => `- ${p.name}：每期 ${money(p.amount)} 元`) : ['（无）']), '')
  out.push({ path: '账本/结构.md', data: lines.join('\n') })
}

function journalFiles(state, out) {
  const days = Object.keys(state.timelog).filter(d => state.timelog[d]?.text?.trim()).sort()
  for (const [month, list] of groupBy(days, d => d.slice(0, 7))) {
    out.push({
      path: `时间日志/${month}.md`,
      data: [`# ${formatMonth(month)} 时间日志`, '', ...list.flatMap(d => [`## ${formatFull(d)} ${weekdayName(d)}`, '', '```', state.timelog[d].text.trim(), '```', ''])].join('\n')
    })
  }
  const thanks = Object.keys(state.gratitude).filter(d => (state.gratitude[d] || []).some(t => t?.trim())).sort()
  for (const [year, list] of groupBy(thanks, d => d.slice(0, 4))) {
    out.push({
      path: `感恩/${year}.md`,
      data: [`# ${year} 年感恩日记`, '', ...list.flatMap(d => [`## ${formatFull(d)} ${weekdayName(d)}`, '', ...state.gratitude[d].filter(t => t?.trim()).map((t, i) => `${i + 1}. ${t.trim()}`), ''])].join('\n')
    })
  }
  for (const skill of state.skills) {
    const list = state.practice.filter(p => p.skillId === skill.id).sort((a, b) => a.date.localeCompare(b.date))
    out.push({ path: `修炼/${safeName(skill.name)}.csv`, data: csv([['日期', '分钟', '练了什么'], ...list.map(p => [p.date, p.minutes, p.note || ''])]) })
  }
}

function classFiles(state, out) {
  const sessions = [...(state.sessions || [])].sort((a, b) => a.startedAt - b.startedAt)
  const time = t => {
    if (!t) return ''
    const d = new Date(t)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const minutes = s => {
    const end = s.endedAt || s.startedAt
    const paused = (s.pauses || []).reduce((n, p) => n + ((p.to || end) - p.from), 0)
    return Math.max(0, Math.round((end - s.startedAt - paused) / 60000))
  }
  for (const [year, list] of groupBy(sessions, s => s.date.slice(0, 4))) {
    out.push({
      path: `课堂/专注-${year}.csv`,
      data: csv([['日期', '节次', '内容', '计划开始', '计划结束', '签到', '签退', '有效分钟', '暂停次数', '在做什么'], ...list.map(s => [s.date, s.periodText || '自由专注', s.title, time(s.plannedStart), time(s.plannedEnd), time(s.startedAt), time(s.endedAt), minutes(s), (s.pauses || []).length, s.note || ''])])
    })
  }
}

function libraryFiles(state, out, attachments) {
  const { library } = state
  const names = state.settings?.kindNames || {}
  const used = new Set()
  for (const kind of KIND_ORDER) {
    const items = library.items.filter(i => i.kind === kind).sort((a, b) => a.no - b.no)
    if (!items.length) continue
    const label = kindName(kind, names)
    const lines = [label === KINDS[kind].noun ? `# ${label}` : `# ${label}（${KINDS[kind].noun}）`, '']
    for (const item of items) {
      lines.push(`## ${itemCode(item, names)}`, '')
      lines.push(kind === 'fragment' ? `> ${item.text.replace(/\n/g, '\n> ')}` : itemTitle(item), '')
      if (item.source && kind === 'fragment') lines.push(`来源：${item.source}`)
      if (item.author) lines.push(`${kind === 'song' ? '歌手' : '作者'}：${item.author}`)
      if (item.source && kind !== 'fragment') lines.push(`出处：${item.source}`)
      if (item.url) lines.push(`链接：${item.url}`)
      if (item.addedAt) lines.push(`入阁：${item.addedAt}`)
      if (item.note) lines.push('', `感想：${item.note}`)
      for (const f of item.files || []) {
        let path = `附件/${safeName(label)}/${safeName(`${itemCode(item, names)} ${f.name}`)}`
        for (let n = 2; used.has(path); n++) path = path.replace(/(\.[^./]*)?$/, ` (${n})$1`)
        used.add(path)
        attachments.push({ id: f.id, path })
        lines.push(`附件：[${f.name}](../${encodeURI(path)})`)
      }
      const uses = library.uses.filter(u => u.itemId === item.id).sort((a, b) => a.date.localeCompare(b.date))
      if (uses.length) lines.push('', `用上的 ${uses.length} 次：`, ...uses.map(u => `- ${u.date}${u.note ? ` ${u.note}` : ''}`))
      lines.push('')
    }
    out.push({ path: `图书馆/${safeName(label)}.md`, data: lines.join('\n') })
  }
  if (library.uses.length) {
    out.push({
      path: '图书馆/实践记录.csv',
      data: csv([['日期', '条目', '解决了什么问题'], ...[...library.uses].sort((a, b) => a.date.localeCompare(b.date)).map(u => {
        const item = library.items.find(i => i.id === u.itemId)
        return [u.date, item ? `${itemCode(item, names)} ${itemTitle(item)}` : '（已删除）', u.note || '']
      })])
    })
  }
}

function milestoneFile(state, out) {
  const lives = normalizeLives(state.lives)
  const lines = ['# 里程碑', '']
  const tree = (parent, depth) =>
    childrenOf(state.goals, parent).flatMap(n => [
      `${'  '.repeat(depth)}- [${n.status === 'done' ? 'x' : ' '}] ${n.title}（${statusName(n.status)}${n.doneAt ? ` · ${n.doneAt}` : n.due ? ` · 目标 ${n.due}` : ''}）${n.note ? ` —— ${n.note}` : ''}`,
      ...tree(n.id, depth + 1)
    ])
  for (const life of [...lives].reverse()) {
    lines.push(`## ${life.name}（${life.start} – ${life.end}）${life.theme ? ` · ${life.theme}` : ''}`, '')
    const roots = childrenOf(state.goals, null).filter(n => {
      const date = n.start || n.doneAt || n.due
      return date ? date >= life.start && date <= life.end : life === lives[lives.length - 1]
    })
    lines.push(...(roots.length ? roots.flatMap(n => (n.kind === 'event' ? [`- ${n.doneAt} ${n.title}`] : [`- **${n.title}**（${statusName(n.status)}）`, ...tree(n.id, 1)])) : ['（无）']), '')
  }
  out.push({ path: '里程碑.md', data: lines.join('\n') })
}

// 返回 { entries: [{ path, data }], attachments: [{ id, path }] }；附件的内容由调用方从本机读出后补上。
export function buildArchive(state, { today = todayKey() } = {}) {
  const entries = []
  const attachments = []
  ledgerFiles(state, entries)
  journalFiles(state, entries)
  classFiles(state, entries)
  libraryFiles(state, entries, attachments)
  milestoneFile(state, entries)
  entries.unshift(
    {
      path: '说明.md',
      data: [
        `# ${state.profile.name ? `${state.profile.name}的` : ''}人生档案`,
        '',
        `导出于 ${today}。这份档案不依赖任何网站，用记事本、Excel、看图软件就能打开。`,
        '',
        '- `账本/`：流水按年一张表（Excel 可直接打开），账户与结构。',
        '- `时间日志/`、`感恩/`：按月、按年的 Markdown 文本。',
        '- `修炼/`：每项技能的练习记录表。',
        '- `课堂/`：每次签到专注的计划时间、实际签到签退、有效分钟与在做什么。',
        `- \`图书馆/\`：${KIND_ORDER.map(k => kindName(k, state.settings?.kindNames)).join('、')}，以及实践记录。`,
        '- `附件/`：图书馆里的原始文件，按条目编号命名。',
        '- `里程碑.md`：各辈子的目标与纪事。',
        '- `data.json` 与 `附件/索引.json`：完整数据，在网站「设置 → 数据与备份 → 从备份恢复」里选这个 zip（或把整个文件夹重新压缩）即可恢复。',
        ''
      ].join('\n')
    },
    { path: 'data.json', data: JSON.stringify(state, null, 2) },
    { path: '附件/索引.json', data: JSON.stringify(Object.fromEntries(attachments.map(a => [a.id, a.path])), null, 2) }
  )
  return { entries, attachments }
}

// 档案自己生成的文件。同步和备份时，这类文件里档案已经不再生成的（比如分类改了名、某类收藏清空了）会被删掉，
// 免得多年后翻到一份过期的；历史快照、附件原件和你自己放进去的文件都不动。
const OWN_FILES = ['data.json', '说明.md', '里程碑.md', '附件/索引.json']
const OWN_DIRS = ['账本/', '时间日志/', '感恩/', '修炼/', '课堂/', '图书馆/']
export const isArchivePath = path => OWN_FILES.includes(path) || (OWN_DIRS.some(d => path.startsWith(d)) && /\.(md|csv)$/.test(path))
