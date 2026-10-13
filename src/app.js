import * as store from './core/store.js'
import { applyVars, html } from './core/html.js'
import { todayKey, isValidKey, addDays, parseDateInput, formatMonthDay, weekdayName, relativeDay } from './core/dates.js'
import { lifePosition } from './domain/life.js'
import { icon, seal } from './ui/icons.js'
import { sheetHead, sheetActions, field } from './ui/parts.js'
import * as shared from './ui/shared.js'
import today from './pages/today.js'
import focus from './pages/focus.js'
import review from './pages/review.js'
import ledger from './pages/ledger.js'
import skill from './pages/skill.js'
import milestones from './pages/milestones.js'
import library from './pages/library.js'
import overview from './pages/overview.js'
import settings from './pages/settings.js'
import { applyTheme, themeSwitch } from './ui/theme.js'
import { setKindNames } from './domain/library.js'
import { sealChar, displayName } from './domain/seed.js'
import { avatar } from './ui/avatar.js'
import { autoBackup } from './ui/backup.js'
import { startAutoSync, onStatus, onMerged, statusText } from './ui/sync.js'
import { settle, effectiveMinutes } from './domain/focus.js'
import { duration } from './core/dates.js'

const PAGES = { today, focus, review, ledger, skill, milestones, library, overview, settings }
const NAV = [
  { id: 'today', label: '今日', icon: 'sun' },
  { id: 'focus', label: '专注', icon: 'clock' },
  { id: 'review', label: '复盘', icon: 'moon' },
  { id: 'ledger', label: '账本', icon: 'wallet' },
  { id: 'skill', label: '修炼', icon: 'flame' },
  { id: 'milestones', label: '里程碑', icon: 'flag' },
  { id: 'library', label: '图书馆', icon: 'book' },
  { id: 'overview', label: '盘点', icon: 'scale' },
  { id: 'settings', label: '设置', icon: 'gear' }
]
const TABBAR = ['today', 'review', 'ledger', 'skill']

const main = document.getElementById('main')
const sheet = document.getElementById('sheet')
const toastEl = document.getElementById('toast')
let route = { name: null, params: [] }
let cleanup = null
let lastDirection = ''

function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  return { name: PAGES[name] ? name : 'today', params }
}

const routeDate = () => (isValidKey(route.params[0]) ? route.params[0] : todayKey())

const ctx = {
  get state() {
    return store.getState()
  },
  get today() {
    return todayKey()
  },
  get params() {
    return route.params
  },
  get date() {
    return routeDate()
  },
  get direction() {
    return lastDirection
  },
  update: (fn, opts) => store.update(fn, opts),
  go(hash, { replace = false } = {}) {
    if (replace) location.replace(hash)
    else location.hash = hash
  },
  setDate(key) {
    if (!isValidKey(key)) return
    lastDirection = key > routeDate() ? 'next' : key < routeDate() ? 'prev' : ''
    const hash = key === todayKey() ? `#/${route.name}` : `#/${route.name}/${key}`
    if (location.hash === hash || (!location.hash && hash === '#/today')) render()
    else location.replace(hash)
  },
  rerender: () => render(),
  patch(region, content) {
    const el = document.querySelector(`[data-region="${region}"]`)
    if (!el) return
    el.innerHTML = String(content)
    applyVars(el)
  },
  openSheet,
  closeSheet,
  toast,
  undo: () => undoLast(),
  undoable(message, mutate) {
    store.update(mutate)
    toast(message)
  }
}

function undoLast() {
  if (!store.undo()) return toast('没有可以撤销的了')
  applyTheme(store.getState().settings.theme)
  setKindNames(store.getState().settings.kindNames)
  setKindNames(store.getState().settings.kindNames)
  toast('已撤销')
}

function render() {
  const page = PAGES[route.name]
  cleanup?.()
  cleanup = null
  main.innerHTML = String(page.render(ctx))
  main.dataset.page = route.name
  applyVars(main)
  // 横向热力图滚到“今天”那一列附近；今天不在图里（看往年）时滚到最右。
  for (const el of main.querySelectorAll('[data-scroll-today]')) {
    const cell = el.querySelector('.is-today')
    el.scrollLeft = cell ? Number(cell.getAttribute('x')) - el.clientWidth * 0.7 : el.scrollWidth
  }
  cleanup = page.mount?.(main, ctx) || null
  renderChrome()
  lastDirection = ''
}

// 侧栏的头像（没有就是印章）与浏览器标签图标随资料变化；公开代码只带默认的“七”。
let shownSeal = ''
let shownMark = ''
function applyMark(profile) {
  const mark = `${profile.avatar ? profile.avatar.length + profile.avatar.slice(-24) : ''}|${sealChar(profile)}`
  if (mark === shownMark) return
  shownMark = mark
  document.querySelector('[data-region="brand-mark"]').innerHTML = String(avatar(profile, 36))
}
function applySeal(char) {
  if (char === shownSeal) return
  shownSeal = char
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="1" y="1" width="38" height="38" rx="8" fill="#b23b29"/><rect x="4.5" y="4.5" width="31" height="31" rx="5" fill="none" stroke="#fbf3ea" stroke-opacity=".5"/><text x="20" y="28.4" text-anchor="middle" font-size="22" fill="#fbf3ea" font-family="Kaiti SC, STKaiti, KaiTi, serif">${char.replace(/[<>&"]/g, '')}</text></svg>`
  const link = document.querySelector('link[rel="icon"]')
  if (link) link.href = 'data:image/svg+xml,' + encodeURIComponent(svg)
}

function renderChrome() {
  const state = store.getState()
  const current = route.name
  document.title = `${NAV.find(n => n.id === current).label} · ${displayName(state.profile) || '七年'}`
  document.querySelector('[data-region="nav"]').innerHTML = String(
    html`${NAV.map(n => html`<a class="nav-item ${n.id === current ? 'is-on' : ''}" href="#/${n.id}" ${n.id === current ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`)}`
  )
  const inMore = !TABBAR.includes(current)
  document.querySelector('[data-region="tabbar"]').innerHTML = String(
    html`${TABBAR.map(id => NAV.find(n => n.id === id)).map(n => html`<a class="tab ${n.id === current ? 'is-on' : ''}" href="#/${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`)}
      <button class="tab ${inMore ? 'is-on' : ''}" data-action="open-more">${icon(inMore ? NAV.find(n => n.id === current).icon : 'more')}<span>${inMore ? NAV.find(n => n.id === current).label : '更多'}</span></button>`
  )
  const pos = lifePosition(state.lives, todayKey())
  document.querySelector('[data-region="side-foot"]').innerHTML = pos
    ? String(html`<a class="side-life" href="#/milestones"><span class="side-life-name">${pos.life.name}</span><span class="side-life-day">第 <b>${pos.day}</b> 天</span><span class="side-life-bar">${Array.from({ length: 7 }, (_, i) => html`<i class="${i + 1 < pos.year ? 'is-full' : i + 1 === pos.year ? 'is-now' : ''}" ${i + 1 === pos.year ? html`data-vars="w:${((pos.yearDay / pos.yearDays) * 100).toFixed(1)}%"` : ''}></i>`)}</span></a>`)
    : ''
  document.querySelector('[data-region="side-foot"]').insertAdjacentHTML('beforeend', String(themeSwitch(state.settings.theme || 'auto', { labels: false })))
  const syncLine = statusText()
  if (syncLine) document.querySelector('[data-region="side-foot"]').insertAdjacentHTML('beforeend', String(html`<a class="sync-line" href="#/settings">${syncLine}</a>`))
  applyVars(document.querySelector('[data-region="side-foot"]'))
  document.querySelector('.brand-name').textContent = displayName(state.profile) || '七年'
  document.querySelector('.brand-sub').textContent = state.profile.signature?.trim() || '七年 · 人生中台'
  applyMark(state.profile)
  applySeal(sealChar(state.profile))
}

// ---------- 底部面板 ----------
function openSheet(content) {
  sheet.innerHTML = String(content)
  applyVars(sheet)
  sheet.classList.remove('is-closing')
  if (!sheet.open) sheet.showModal()
  const focus = sheet.querySelector('[autofocus]')
  if (focus) requestAnimationFrame(() => focus.focus())
}

function closeSheet() {
  if (!sheet.open) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return sheet.close()
  sheet.classList.add('is-closing')
  setTimeout(() => {
    sheet.close()
    sheet.classList.remove('is-closing')
  }, 160)
}

sheet.addEventListener('click', event => {
  if (event.target === sheet) closeSheet()
})
sheet.addEventListener('cancel', event => {
  event.preventDefault()
  closeSheet()
})

// ---------- 提示条 ----------
// 刚发生过一次可撤销的改动时，提示条自动带上“撤销”。
let toastTimer = null
let toastUndo = null
let toastedChange = 0
function toast(message, { undo } = {}) {
  const changedAt = store.lastChangeAt()
  if (undo === undefined && changedAt > toastedChange && Date.now() - changedAt < 1500) {
    undo = () => undoLast()
    toastedChange = changedAt
  }
  toastUndo = undo || null
  toastEl.innerHTML = String(html`<span>${message}</span>${undo ? html`<button class="toast-undo" data-action="toast-undo">${icon('undo')}撤销</button>` : ''}`)
  toastEl.classList.add('is-on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), undo ? 5000 : 2200)
}

// ---------- 全局动作 ----------
const GLOBAL_ACTIONS = {
  'close-sheet': () => closeSheet(),
  'toast-undo': () => {
    toastUndo?.()
    toastUndo = null
    toastEl.classList.remove('is-on')
  },
  'shift-day': ({ value }) => {
    if (value === 'today') return ctx.setDate(todayKey())
    ctx.setDate(addDays(routeDate(), Number(value)))
  },
  'jump-date': () => openJump(),
  'open-more': () => openSheet(moreSheet()),
  'set-theme': ({ value }) => {
    applyTheme(value, { animate: true })
    store.update(
      s => {
        s.settings.theme = value
      },
      { record: false }
    )
    if (sheet.open && sheet.querySelector('.more-grid')) openSheet(moreSheet())
  }
}

function moreSheet() {
  return html`${sheetHead('更多')}<nav class="more-grid">${NAV.filter(n => !TABBAR.includes(n.id)).map(n => html`<a class="more-item" href="#/${n.id}" data-action="close-sheet">${icon(n.icon)}<span>${n.label}</span></a>`)}</nav>
    <div class="more-theme"><span class="field-label">外观</span>${themeSwitch(store.getState().settings.theme || 'auto')}</div>`
}

function openJump() {
  const key = routeDate()
  openSheet(html`<form data-form="jump-date" class="sheet-form">
    ${sheetHead('跳到某一天', '可以直接写：10.20、1020、下周三、+7、15号')}
    ${field('输入日期', html`<input name="text" class="input input-lg" data-input="jump-preview" autocomplete="off" placeholder="例如 10.20" autofocus>`)}
    <p class="jump-preview" data-region="jump-preview">回车即可前往</p>
    ${field('或从日历选择', html`<input name="date" type="date" class="input" value="${key}">`)}
    ${sheetActions('前往')}
  </form>`)
}

const GLOBAL_INPUTS = {
  'jump-preview': ({ el }) => {
    const key = parseDateInput(el.value, todayKey())
    ctx.patch('jump-preview', el.value.trim() ? (key ? html`→ ${formatMonthDay(key)} ${weekdayName(key)} · ${relativeDay(key, todayKey())}` : '没认出这个日期') : '回车即可前往')
  }
}

const GLOBAL_FORMS = {
  'jump-date': ({ data }) => {
    const key = parseDateInput(data.text, todayKey()) || (isValidKey(data.date) ? data.date : null)
    if (!key) return toast('没认出这个日期')
    closeSheet()
    ctx.setDate(key)
  }
}

function find(kind, name) {
  const page = PAGES[route.name]
  return page[kind]?.[name] || shared[kind]?.[name] || { actions: GLOBAL_ACTIONS, inputs: GLOBAL_INPUTS, forms: GLOBAL_FORMS }[kind][name]
}

document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]')
  if (!el || el.disabled) return
  const handler = find('actions', el.dataset.action)
  if (!handler) return
  if (el.tagName === 'A' && el.dataset.action !== 'close-sheet') event.preventDefault()
  handler({ el, event, value: el.dataset.value, id: el.dataset.id, ctx })
})

function onInput(event) {
  const el = event.target.closest('[data-input]')
  if (!el) return
  if (event.isComposing) return
  find('inputs', el.dataset.input)?.({ el, event, value: el.type === 'checkbox' ? el.checked : el.value, ctx })
}
document.addEventListener('input', onInput)
document.addEventListener('compositionend', onInput)
document.addEventListener('change', event => {
  const el = event.target.closest('[data-change]')
  if (!el) return
  find('changes', el.dataset.change)?.({ el, event, value: el.type === 'checkbox' ? el.checked : el.value, ctx })
})

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]')
  if (!form) return
  event.preventDefault()
  const data = Object.fromEntries(new FormData(form))
  find('forms', form.dataset.form)?.({ form, data, ctx })
})

document.addEventListener('keydown', event => {
  // Ctrl/⌘+Z：不在输入框里时撤销上一次改动；输入框里交给浏览器自己的撤销。
  const inField = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    if (inField) return
    event.preventDefault()
    return undoLast()
  }
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  const typing = inField || sheet.open
  if (typing) return
  const dated = route.name === 'today' || route.name === 'review'
  if (dated && event.key === 'ArrowLeft') ctx.setDate(addDays(routeDate(), -1))
  else if (dated && event.key === 'ArrowRight') ctx.setDate(addDays(routeDate(), 1))
  else if (dated && (event.key === 't' || event.key === 'T')) ctx.setDate(todayKey())
  else if (dated && (event.key === 'g' || event.key === 'G' || event.key === '/')) {
    event.preventDefault()
    openJump()
  } else return
})

// 手机上左右轻扫切换日期，只在今日与复盘页、且不是在横向滚动的区域里。
let touch = null
main.addEventListener(
  'touchstart',
  event => {
    if (event.touches.length !== 1 || event.target.closest('textarea, input, .heatmap-scroll, .no-swipe')) return (touch = null)
    touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, t: Date.now() }
  },
  { passive: true }
)
main.addEventListener(
  'touchend',
  event => {
    if (!touch || !(route.name === 'today' || route.name === 'review')) return
    const dx = event.changedTouches[0].clientX - touch.x
    const dy = event.changedTouches[0].clientY - touch.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8 && Date.now() - touch.t < 600) ctx.setDate(addDays(routeDate(), dx < 0 ? 1 : -1))
    touch = null
  },
  { passive: true }
)

function onRoute() {
  const next = parseHash()
  const pageChanged = next.name !== route.name
  route = next
  if (sheet.open && pageChanged) closeSheet()
  render()
  if (pageChanged) {
    main.classList.remove('enter')
    void main.offsetWidth
    main.classList.add('enter')
    window.scrollTo(0, 0)
  }
}

async function start() {
  try {
    await store.load(todayKey())
  } catch (error) {
    main.innerHTML = String(html`<div class="fatal"><h1>数据没能读取</h1><p>${error.message}</p><p>为避免覆盖，网站没有写入任何东西。可以在设置里导入备份，或换用最新版本的网站。</p></div>`)
    return
  }
  applyTheme(store.getState().settings.theme)
  store.subscribe(render)
  store.onError(() => toast('保存失败：浏览器存储空间不足或被禁用，请尽快导出备份'))
  window.addEventListener('hashchange', onRoute)
  // 页面切走时先存本机，再（已授权的话）把数据写进备份文件夹；开着的时候每 10 分钟也看一眼。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.save().then(autoBackup)
  })
  setInterval(autoBackup, 10 * 60 * 1000)
  window.addEventListener('pagehide', () => store.save())
  onRoute()
  store.requestPersist()
  store.collectGarbage().catch(() => {})
  // 不在专注页时也会到点自动签退（专注页自己每秒检查）。
  const settleDue = () => {
    if (route.name === 'focus' || !store.getState().sessions.some(s => !s.endedAt && s.plannedEnd && Date.now() >= s.plannedEnd)) return
    let closed = []
    store.update(s => {
      closed = settle(s.sessions)
    }, { record: false })
    const last = closed[closed.length - 1]
    if (last) toast(`${last.title} 下课了，已自动签退 · 有效 ${duration(effectiveMinutes(last))}`)
  }
  settleDue()
  setInterval(settleDue, 30 * 1000)
  onStatus(() => renderChrome())
  onMerged(n => toast(`已合并另一台设备的 ${n} 处改动`))
  startAutoSync()
  // 离线支持：打开过一次之后，断网或 GitHub 访问不稳时也能用。
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {})
}

start()
