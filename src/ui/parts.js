import { html, raw, vars, pct } from '../core/html.js'
import { icon } from './icons.js'
import { startOfWeek, eachDay, formatMonthDay, weekdayName, relativeDay, addDays, WEEKDAYS } from '../core/dates.js'

export function pageHead(title, sub, extra = '') {
  return html`<header class="page-head">
    <div><h1 class="page-title">${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div>
    ${extra ? html`<div class="page-tools">${extra}</div>` : ''}
  </header>`
}

export function dateNav(key, today, extra = '') {
  return html`<div class="datenav">
    <button class="icon-btn" data-action="shift-day" data-value="-1" aria-label="前一天" title="前一天（←）">${icon('left')}</button>
    <button class="datenav-label" data-action="jump-date" title="跳到某一天（G）">
      <span class="datenav-date">${formatMonthDay(key)}</span>
      <span class="datenav-sub">${weekdayName(key)} · ${relativeDay(key, today)}${extra}</span>
    </button>
    <button class="icon-btn" data-action="shift-day" data-value="1" aria-label="后一天" title="后一天（→）">${icon('right')}</button>
    ${key !== today ? html`<button class="chip chip-return" data-action="shift-day" data-value="today">回到今天</button>` : ''}
  </div>`
}

export function segmented(items, value, action, label = '') {
  return html`<div class="seg" role="tablist" aria-label="${label}">
    ${items.map(item => html`<button role="tab" class="seg-item ${item.id === value ? 'is-on' : ''}" aria-selected="${item.id === value}" data-action="${action}" data-value="${item.id}">${item.name}${item.count !== undefined ? html`<span class="seg-count">${item.count}</span>` : ''}</button>`)}
  </div>`
}

export function empty(title, hint = '', action = '') {
  return html`<div class="empty"><p class="empty-title">${title}</p>${hint ? html`<p class="empty-hint">${hint}</p>` : ''}${action}</div>`
}

export function meter(value, total, cls = '') {
  return html`<div class="meter ${cls}"><i data-vars="${vars({ w: pct(value, total) })}"></i></div>`
}

// 堆叠条：parts = [{ value, tone|cat|kind, label }]
export function stack(parts, total, attr = 'data-tone') {
  const sum = total ?? parts.reduce((s, p) => s + p.value, 0)
  return html`<div class="stack">${parts
    .filter(p => p.value > 0)
    .map(p => raw(`<i ${attr}="${p.key}" data-vars="w:${pct(p.value, sum)}" title="${p.label || ''}"></i>`))}</div>`
}

export function stat(label, value, sub = '', cls = '') {
  return html`<div class="stat ${cls}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${sub ? html`<span class="stat-sub">${sub}</span>` : ''}</div>`
}

// 热力图：按周排列（周一在上），只用一个色相的五档深浅。未来的日子画成虚格。
export function heatmap({ from, to, today, values, thresholds = [1, 2, 3], describe, action = '' }) {
  const start = startOfWeek(from)
  const end = addDays(startOfWeek(to), 6)
  const days = eachDay(start, end)
  const size = 11
  const gap = 3
  const top = 16
  const left = 18
  const weeks = Math.ceil(days.length / 7)
  const width = left + weeks * (size + gap)
  const height = top + 7 * (size + gap)
  let cells = ''
  let labels = ''
  let lastMonth = ''
  days.forEach((key, i) => {
    const col = Math.floor(i / 7)
    const row = i % 7
    const x = left + col * (size + gap)
    const y = top + row * (size + gap)
    const month = key.slice(5, 7)
    if (row === 0 && month !== lastMonth && key.slice(8) <= '07') {
      labels += `<text class="hm-label" x="${x}" y="10">${Number(month)}月</text>`
      lastMonth = month
    }
    if (key < from || key > to) return
    const value = values[key] || 0
    const level = value <= 0 ? 0 : value < thresholds[0] ? 1 : value < thresholds[1] ? 2 : value < thresholds[2] ? 3 : 4
    const cls = `hm l${level}${key === today ? ' is-today' : ''}${key > today ? ' is-future' : ''}`
    const title = `${formatMonthDay(key)} ${describe ? describe(value) : value}`
    const act = action && key <= today ? ` data-action="${action}" data-value="${key}"` : ''
    cells += `<rect class="${cls}" x="${x}" y="${y}" width="${size}" height="${size}" rx="2.5"${act}><title>${title}</title></rect>`
  })
  for (const row of [0, 2, 4]) labels += `<text class="hm-label" x="0" y="${top + row * (size + gap) + 9}">${WEEKDAYS[row + 1]}</text>`
  return html`<div class="heatmap">
    <div class="heatmap-scroll" data-scroll-today><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="热力图">${raw(labels + cells)}</svg></div>
    <div class="heatmap-legend"><span>少</span>${[0, 1, 2, 3, 4].map(l => raw(`<i class="hm-key l${l}"></i>`))}<span>多</span></div>
  </div>`
}

export function field(label, control, hint = '') {
  return html`<label class="field"><span class="field-label">${label}</span>${control}${hint ? html`<span class="field-hint">${hint}</span>` : ''}</label>`
}

export function sheetHead(title, sub = '') {
  return html`<div class="sheet-head"><div><h2 class="sheet-title">${title}</h2>${sub ? html`<p class="sheet-sub">${sub}</p>` : ''}</div><button type="button" class="icon-btn" data-action="close-sheet" aria-label="关闭">${icon('close')}</button></div>`
}

export function sheetActions(primary = '保存', extra = '') {
  return html`<div class="sheet-actions">${extra}<span class="grow"></span><button type="button" class="btn ghost" data-action="close-sheet">取消</button><button type="submit" class="btn primary">${primary}</button></div>`
}

export const options = (items, value) => items.map(item => html`<option value="${item.id}" ${String(item.id) === String(value) ? 'selected' : ''}>${item.name}</option>`)
