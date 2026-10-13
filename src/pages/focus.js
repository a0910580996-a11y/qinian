import { html, raw } from '../core/html.js'
import { clock, nowMinutes, formatMonthDay, weekdayName, relativeDay, isValidKey, duration } from '../core/dates.js'
import { uid } from '../core/store.js'
import { coursesFor } from '../domain/schedule.js'
import { blockKey, blockBreaks, atMinute, sessionStatus, effectiveMs, effectiveMinutes, inBreak, pause, resume, finish, settle, phase, sessionFor, attendance, REST_IDEAS } from '../domain/focus.js'
import { icon } from '../ui/icons.js'
import { sheetHead } from '../ui/parts.js'

// 专注页：全屏、夜色里的水墨远山。默认跟着课表走——上课时是这一节的表盘，课间画面亮成晨光、给一个休息的小建议；
// 下课自动签退，到下一节自动换内容，不弹窗。
let drafts = {}
let freeTitle = ''
let freeTarget = 45
let shownSignature = ''
let ideaIndex = Math.floor(Math.random() * 6)
let wakeLock = null
let wakeWanted = (() => {
  try {
    return localStorage.getItem('qinian:wake') !== 'off'
  } catch {
    return true
  }
})()

const pad = n => String(n).padStart(2, '0')
const hms = t => {
  const s = Math.max(0, Math.floor(t / 1000))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
const mmss = t => {
  const s = Math.max(0, Math.ceil(t / 1000))
  return s >= 3600 ? hms(s * 1000) : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}
const nowClock = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const startClock = t => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function route(ctx) {
  const [date, key] = ctx.params
  return { date: isValidKey(date) ? date : ctx.today, key: isValidKey(date) ? key || null : null }
}

// 要显示什么：网址指定的段；否则正在进行的专注；否则按此刻的阶段（上课 / 课间 / 还没开始 / 结束）。
function resolve(ctx) {
  const { state, today } = ctx
  const { date, key } = route(ctx)
  const live = date === today
  const blocks = coursesFor(state.schedule, date).blocks
  const active = state.sessions.find(s => !s.endedAt && s.date === today) || null
  const p = live ? phase(blocks, nowMinutes()) : { kind: 'review' }
  let mode = 'block'
  let target = null
  if (key === 'free' || (!key && live && active && !active.blockKey)) mode = 'free'
  else if (key) target = blocks.find(b => blockKey(b) === key) || null
  else if (live && active?.blockKey) target = blocks.find(b => blockKey(b) === active.blockKey) || null
  else if (live) target = p.block
  const session = mode === 'free' ? (active && !active.blockKey ? active : null) : target ? sessionFor(state.sessions, date, blockKey(target)) : null
  const ownPhase = live && target && p.block === target ? p : null
  let view = 'class'
  if (mode === 'free') view = 'free'
  else if (!target) view = 'done'
  else if (!live) view = 'review'
  else if (session && inBreak(session)) view = 'rest'
  else if (!session && ownPhase && (ownPhase.kind === 'rest' || ownPhase.kind === 'before')) view = 'rest'
  else if (!session && nowMinutes() < target.start) view = 'rest'
  return { date, key, live, blocks, active, target, mode, session, phase: p, view, auto: !key }
}

const signature = r => `${r.view}|${r.mode}|${r.target ? blockKey(r.target) : ''}|${r.session ? `${r.session.id}:${sessionStatus(r.session)}` : ''}`

// 当前这一节（或下一节）。
function currentSegment(r) {
  const b = r.target
  if (!b) return null
  const segs = b.segments || [{ label: b.periodText, start: b.start, end: b.end }]
  const m = nowMinutes()
  return segs.find(s => m < s.end) || segs[segs.length - 1]
}

// ---------- 表盘 ----------
// 一圈 = 一节课（或一次课间、一次自由专注的预估时间）；120 道刻度，走过的亮，没走的暗；指针是此刻。
function dial(from, to, now, { labels = true } = {}) {
  const C = 160
  const total = Math.max(to - from, 1)
  const progress = Math.min(Math.max((now - from) / total, 0), 1)
  let ticks = ''
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2 - Math.PI / 2
    const r1 = i % 10 === 0 ? 112 : 118
    const lit = i / 120 < progress
    ticks += `<line x1="${(C + Math.cos(a) * r1).toFixed(1)}" y1="${(C + Math.sin(a) * r1).toFixed(1)}" x2="${(C + Math.cos(a) * 132).toFixed(1)}" y2="${(C + Math.sin(a) * 132).toFixed(1)}" class="${lit ? 'tk lit' : 'tk'}"/>`
  }
  const a = progress * Math.PI * 2 - Math.PI / 2
  const deg = (progress * 360).toFixed(1)
  let marks = ''
  if (labels) {
    const spots = [
      [C, 16],
      [C + 150, C + 4],
      [C, C + 152],
      [C - 150, C + 4]
    ]
    ;[0, 0.25, 0.5, 0.75].forEach((q, i) => {
      const t = new Date(from + total * q)
      marks += `<text x="${spots[i][0]}" y="${spots[i][1]}" class="dial-label" text-anchor="middle">${pad(t.getHours())}:${pad(t.getMinutes())}</text>`
    })
  }
  return raw(`<svg class="dial-svg" viewBox="0 0 320 320" aria-hidden="true">
    <circle cx="${C}" cy="${C}" r="148" class="dial-ring"/>
    ${ticks}
    <g transform="rotate(${deg} ${C} ${C})"><path d="M${C} ${C - 140} l-6 -11 h12 z" class="dial-pointer"/></g>
    <circle cx="${(C + Math.cos(a) * 125).toFixed(1)}" cy="${(C + Math.sin(a) * 125).toFixed(1)}" r="4" class="dial-glow"/>
    ${marks}
  </svg>`)
}

function bodyView(r) {
  const now = Date.now()
  const s = r.session
  const st = s ? sessionStatus(s) : null
  const center = (title, digits, sub) => html`<div class="dial-center"><p class="dial-title">${title}</p><span class="dial-rule"></span><p class="dial-digits">${digits}</p><p class="dial-sub">${sub}</p></div>`
  if (r.view === 'free') {
    const targetMs = (s?.target || freeTarget) * 60000
    const from = s ? s.startedAt : now
    const eff = s ? effectiveMs(s, now) : 0
    const sub = !s ? `预估 ${freeTarget} 分钟` : st === 'paused' ? `已暂停 ${mmss(now - s.pauses[s.pauses.length - 1].from)}` : eff >= targetMs ? '已到预估时间，想继续就继续' : `预估 ${s.target || freeTarget} 分钟 · 还剩 ${mmss(targetMs - eff)}`
    return html`<div class="dial ${st === 'paused' ? 'is-paused' : ''}">${dial(from, from + targetMs, from + eff, { labels: false })}${center(s ? s.title : freeTitle || '自由专注', hms(eff), sub)}</div>`
  }
  if (r.view === 'done') return html`<div class="dial">${dial(now, now + 1, now, { labels: false })}${center(r.live ? '今天的课结束了' : '这一天没有课', nowClock(), r.live ? '想再学一会儿，可以开一段自由专注' : '')}</div>`
  const b = r.target
  if (r.view === 'review') {
    return html`<div class="dial">${dial(atMinute(r.date, b.start), atMinute(r.date, b.end), s ? atMinute(r.date, b.end) : atMinute(r.date, b.start))}${center(b.title, s ? hms(effectiveMs(s)) : '未签到', s ? `${formatMonthDay(r.date)} · 签到 ${startClock(s.startedAt)} · 有效 ${duration(effectiveMinutes(s))}` : `${formatMonthDay(r.date)} · 这一段没有专注记录`)}</div>`
  }
  if (r.view === 'rest') {
    const seg = currentSegment(r)
    const p = r.phase
    const inner = s && inBreak(s)
    const brk = inner ? s.breaks.find(x => now >= x.from && now < x.to) : null
    const until = brk ? brk.to : atMinute(r.date, seg.start)
    const restStart = brk ? brk.from : p.after ? atMinute(r.date, p.after.end) : until - 10 * 60000
    const m = nowMinutes()
    const label = inner ? '课间' : p.scope === 'long' ? (m < 14 * 60 ? '午休' : m < 19 * 60 ? '傍晚' : '休息') : p.kind === 'before' ? '还没上课' : '课间'
    return html`<div class="dial is-rest">${dial(restStart, until, now, { labels: false })}<span class="breath"></span>${center(label, mmss(until - now), `${seg.label} ${clock(seg.start)} · ${b.title}${inner ? ' · 课间不计入有效时间' : ''}`)}</div>`
  }
  // 上课：一圈就是这一节
  const seg = currentSegment(r)
  const segFrom = atMinute(r.date, seg.start)
  const segTo = atMinute(r.date, seg.end)
  const sub = !s
    ? `${seg.label} 还剩 ${mmss(segTo - now)} · 点开始签到`
    : st === 'ended'
      ? `已签退 · 有效 ${duration(effectiveMinutes(s))}`
      : st === 'paused'
        ? `已暂停 ${mmss(now - s.pauses[s.pauses.length - 1].from)} · 时间还在走`
        : `有效专注 · ${seg.label} 还剩 ${mmss(segTo - now)}`
  return html`<div class="dial ${st === 'paused' ? 'is-paused' : ''}">${dial(segFrom, segTo, now)}${center(b.title, s ? hms(effectiveMs(s, now)) : nowClock(), sub)}</div>`
}

function ideaView(r) {
  if (r.view !== 'rest') return ''
  const list = r.phase.scope === 'long' ? REST_IDEAS.long : REST_IDEAS.short
  const idea = list[ideaIndex % list.length]
  return html`<button class="fs-idea" data-action="focus-idea"><b>${idea.title}</b><span>${idea.text}</span><small>换一个</small></button>`
}

function metaView(r) {
  if (r.view === 'free') return '不跟课表 · 暂停只停有效时间'
  if (!r.target) return ''
  const b = r.target
  const segs = b.segments || []
  const range = segs.length > 1 ? segs.map(x => `${clock(x.start)}–${clock(x.end)}`).join(' · 课间 · ') : `${clock(b.start)}–${clock(b.end)}`
  return `${b.periodText} · ${range}${b.place ? ` · ${b.place}` : ''}`
}

function actionsView(r) {
  const s = r.session
  const st = s ? sessionStatus(s) : null
  const primary = (action, label) => html`<button class="fs-btn is-primary" data-action="${action}">${label}</button>`
  const ghost = (action, label) => html`<button class="fs-btn" data-action="${action}">${label}</button>`
  if (!r.live) return html`<a class="fs-btn" href="#/focus">回到此刻</a>`
  if (r.view === 'done') return html`${primary('focus-free', '开一段自由专注')}<a class="fs-btn" href="#/today">回到今日</a>`
  if (r.view === 'free') {
    if (!s) return html`${primary('focus-start', '开始')}${ghost('focus-target', `预估 ${freeTarget} 分钟`)}`
    return st === 'paused' ? html`${primary('focus-resume', '继续')}${ghost('focus-end', '结束')}` : html`${ghost('focus-pause', '暂停')}${ghost('focus-end', '结束')}`
  }
  if (!s) return html`${primary('focus-start', r.view === 'rest' ? '提前开始' : '开始')}${ghost('focus-menu', '切换')}`
  if (st === 'ended') return html`<span class="fs-hint">已签退。按错了，提示条上可以撤销。</span>${ghost('focus-menu', '切换')}`
  if (r.view === 'rest') return html`<span class="fs-hint">已签到 · 上课铃一响自动接着计时</span>${ghost('focus-end', '结束')}`
  return st === 'paused' ? html`${primary('focus-resume', '继续')}${ghost('focus-end', '结束')}` : html`${ghost('focus-pause', '暂停')}${ghost('focus-end', '结束')}`
}

const attendOptions = (ctx, r) => ({ minutes: r.live ? nowMinutes() : r.date < ctx.today ? Infinity : -1 })

function attendLine(ctx, r) {
  if (!r.blocks.length) return ''
  const a = attendance(r.blocks, ctx.state.sessions, r.date, attendOptions(ctx, r))
  return html`<button class="fs-attend" data-action="focus-attend">${r.live ? '今天' : formatMonthDay(r.date)} · 出勤 ${a.attended}/${a.due || 0}${a.effective ? ` · 有效 ${duration(a.effective)}` : ''}${a.efficiency !== null && a.due ? ` · 有效率 ${Math.round(a.efficiency * 100)}%` : ''} ›</button>`
}

const HILLS = raw(`<svg class="fs-hills" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
  <path class="hill far" d="M0 128 C40 112 70 118 105 102 C140 86 170 104 205 96 C245 86 272 70 310 84 C345 96 372 88 400 92 L400 200 L0 200Z"/>
  <path class="hill mid" d="M0 150 C45 136 80 146 125 128 C165 112 200 134 245 124 C290 114 330 132 365 122 C380 118 392 120 400 122 L400 200 L0 200Z"/>
  <path class="hill near" d="M0 176 C60 160 120 174 190 164 C255 155 310 170 360 162 C378 159 392 161 400 162 L400 200 L0 200Z"/>
</svg>`)

function releaseWake() {
  wakeLock?.release?.().catch(() => {})
  wakeLock = null
}

async function holdWake(want) {
  if (!want) return releaseWake()
  if (wakeLock || !navigator.wakeLock) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => (wakeLock = null))
  } catch {}
}

function startSession(ctx, r) {
  const now = Date.now()
  const b = r.target
  const free = r.view === 'free'
  const key = free ? 'free' : blockKey(b)
  const note = (document.querySelector('.fs-note[data-input="focus-note"]')?.value ?? drafts[key] ?? '').trim()
  ctx.update(s => {
    // 同一时间只进行一段专注：先把别的收尾。
    for (const other of s.sessions.filter(x => !x.endedAt)) finish(other, now)
    s.sessions.push({
      id: uid(),
      date: ctx.today,
      blockKey: free ? null : key,
      title: free ? (freeTitle || '自由专注').trim() : b.title,
      periodText: free ? '' : b.periodText,
      tone: free ? 'gray' : b.tone,
      plannedStart: free ? null : atMinute(ctx.today, b.start),
      plannedEnd: free ? null : atMinute(ctx.today, b.end),
      breaks: free ? [] : blockBreaks(b, ctx.today),
      target: free ? freeTarget : null,
      startedAt: now,
      endedAt: null,
      pauses: [],
      note
    })
  })
  delete drafts[key]
  ctx.toast(free ? '开始专注' : `签到 · ${b.title}`)
}

function mutateActive(ctx, fn, message) {
  const r = resolve(ctx)
  if (!r.session) return
  const id = r.session.id
  ctx.update(s => fn(s.sessions.find(x => x.id === id), Date.now()))
  if (message) ctx.toast(typeof message === 'function' ? message(ctx.state.sessions.find(x => x.id === id)) : message)
}

function attendSheet(ctx) {
  const r = resolve(ctx)
  const a = attendance(r.blocks, ctx.state.sessions, r.date, attendOptions(ctx, r))
  const free = ctx.state.sessions.filter(s => s.date === r.date && !s.blockKey)
  ctx.openSheet(html`<div class="sheet-form">
    ${sheetHead(`${r.live ? '今天' : formatMonthDay(r.date)}的课堂`, a.due ? `出勤 ${a.attended}/${a.due} · 有效 ${duration(a.effective)} / 上课 ${duration(a.planned)}${a.efficiency !== null ? ` · 有效率 ${Math.round(a.efficiency * 100)}%` : ''}` : '还没开始')}
    <ul class="attend">${a.rows.map(row => {
      const s = row.session
      const st = s ? sessionStatus(s) : null
      const label = s ? (st === 'ended' ? `有效 ${duration(row.effective)}` : st === 'paused' ? '暂停中' : '专注中') : row.due ? (r.live && row.block.end > nowMinutes() ? '还没签到' : '未签到') : '未开始'
      return html`<li><a class="attend-row" href="#/focus/${r.date}/${blockKey(row.block)}" data-tone="${row.block.tone}" data-action="close-sheet">
        <span class="attend-time">${clock(row.block.start)}</span>
        <span class="attend-title"><i></i>${row.block.title}<small>${row.block.periodText}</small></span>
        <span class="attend-note">${s?.note || ''}</span>
        <span class="attend-state ${s ? (st === 'ended' ? 'is-done' : 'is-live') : row.due ? 'is-miss' : ''}">${s && st === 'ended' ? icon('check') : ''}${label}</span>
      </a></li>`
    })}</ul>
    ${free.length ? html`<p class="muted small">自由专注 ${free.length} 次 · 有效 ${duration(free.reduce((n, s) => n + effectiveMinutes(s), 0))}</p>` : ''}
  </div>`)
}

export default {
  render(ctx) {
    const r = resolve(ctx)
    shownSignature = signature(r)
    const key = r.view === 'free' ? 'free' : r.target ? blockKey(r.target) : null
    const note = r.session ? r.session.note : drafts[key] || ''
    const seg = r.target && r.live ? currentSegment(r) : null
    const chip = r.view === 'free' ? '自由' : r.view === 'rest' && !(r.session && inBreak(r.session)) ? '课间' : seg ? seg.label : r.target ? r.target.periodText : '今天'
    const showNote = r.live && (r.view === 'class' || r.view === 'free' || (r.view === 'rest' && !r.session && r.target))
    return html`
      <div class="focus-screen" data-phase="${r.view}" data-tone="${r.target?.tone || 'gray'}">
        <div class="fs-sky"></div>
        ${HILLS}
        <header class="fs-top">
          <a class="fs-icon" href="${r.live ? '#/today' : `#/today/${r.date}`}" aria-label="退出专注">${icon('close')}</a>
          <span class="fs-chip">${chip}</span>
          <span class="fs-top-right">
            <button class="fs-icon" data-action="focus-menu" aria-label="切换课程" title="切换课程">${icon('calendar')}</button>
            <button class="fs-icon ${wakeWanted ? 'is-on' : ''}" data-action="focus-wake" aria-label="专注时屏幕常亮" title="专注时屏幕常亮">${icon('sun')}</button>
          </span>
        </header>
        <p class="fs-date">${formatMonthDay(r.date)} ${weekdayName(r.date)} · ${relativeDay(r.date, ctx.today)}${r.live && !r.auto ? html` · <a href="#/focus">跟随课表</a>` : ''}</p>
        <div class="fs-body" data-region="fs-body">${bodyView(r)}</div>
        <p class="fs-meta">${metaView(r)}</p>
        <div class="fs-idea-slot" data-region="fs-idea">${ideaView(r)}</div>
        <footer class="fs-foot">
          ${r.view === 'free' && !r.session ? html`<input class="fs-note fs-free-title" data-input="focus-free-title" maxlength="30" autocomplete="off" placeholder="专注什么？比如：背单词" value="${freeTitle}">` : ''}
          ${showNote ? html`<input class="fs-note" data-input="focus-note" maxlength="80" autocomplete="off" placeholder="请输入你此刻在做的事" value="${note}">` : ''}
          <div class="fs-actions" data-region="fs-actions">${actionsView(r)}</div>
          ${attendLine(ctx, r)}
        </footer>
      </div>`
  },
  mount(root, ctx) {
    let lastActions = ''
    const tick = () => {
      // 下课自动签退；收尾的正是眼前这段时，回到“跟随课表”，自动换到下一段。
      if (ctx.state.sessions.some(x => !x.endedAt && x.plannedEnd && Date.now() >= x.plannedEnd)) {
        let closed = []
        ctx.update(st => {
          closed = settle(st.sessions)
        }, { record: false, render: false })
        const last = closed[closed.length - 1]
        if (last) ctx.toast(`${last.title}${last.periodText ? ` ${last.periodText}` : ''} 下课了 · 有效 ${duration(effectiveMinutes(last))}`)
        if (route(ctx).key) return ctx.go('#/focus', { replace: true })
        return ctx.rerender()
      }
      const r = resolve(ctx)
      // 阶段一变（上课 ↔ 课间、换到下一段），整页换内容，不弹窗。
      if (signature(r) !== shownSignature) return ctx.rerender()
      ctx.patch('fs-body', bodyView(r))
      const actions = String(actionsView(r))
      if (actions !== lastActions) {
        lastActions = actions
        ctx.patch('fs-actions', actionsView(r))
      }
      holdWake(wakeWanted && r.session && sessionStatus(r.session) === 'running' && !inBreak(r.session))
      document.title = r.view === 'rest' ? '课间 · 起来走走' : r.session && !r.session.endedAt ? `${hms(effectiveMs(r.session))} · ${r.session.title}` : '专注 · 七年'
    }
    tick()
    const timer = setInterval(tick, 1000)
    const onKey = event => {
      if (event.key === 'Escape' && !document.getElementById('sheet').open) ctx.go(route(ctx).date === ctx.today ? '#/today' : `#/today/${route(ctx).date}`)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearInterval(timer)
      document.removeEventListener('keydown', onKey)
      releaseWake()
    }
  },
  actions: {
    'focus-start': ({ ctx }) => startSession(ctx, resolve(ctx)),
    'focus-pause': ({ ctx }) => mutateActive(ctx, pause, '已暂停 · 墙上的时间还在走'),
    'focus-resume': ({ ctx }) => mutateActive(ctx, resume, '继续'),
    'focus-end': ({ ctx }) => mutateActive(ctx, finish, s => `签退 · 有效 ${duration(effectiveMinutes(s))}`),
    'focus-free': ({ ctx }) => ctx.go(`#/focus/${ctx.today}/free`),
    'focus-idea': ({ ctx }) => {
      ideaIndex++
      ctx.patch('fs-idea', ideaView(resolve(ctx)))
    },
    'focus-target': ({ ctx }) => {
      const choices = [25, 45, 60, 90, 120]
      freeTarget = choices[(choices.indexOf(freeTarget) + 1) % choices.length]
      ctx.rerender()
    },
    'focus-wake': ({ ctx }) => {
      wakeWanted = !wakeWanted
      try {
        localStorage.setItem('qinian:wake', wakeWanted ? 'on' : 'off')
      } catch {}
      if (!wakeWanted) releaseWake()
      ctx.toast(wakeWanted ? '专注时屏幕保持常亮' : '不再保持屏幕常亮')
      ctx.rerender()
    },
    'focus-attend': ({ ctx }) => attendSheet(ctx),
    'focus-menu': ({ ctx }) => {
      const r = resolve(ctx)
      ctx.openSheet(html`<div class="sheet-form">
        ${sheetHead('专注哪一段', '默认跟随课表；也可以选别的段，或开一段自由专注')}
        <nav class="focus-menu">
          ${r.live ? html`<a class="focus-menu-item" href="#/focus" data-action="close-sheet"><b>跟随课表</b><span>上课、课间、下一节自动切换</span></a>` : ''}
          ${r.blocks.map(b => {
            const s = sessionFor(ctx.state.sessions, r.date, blockKey(b))
            return html`<a class="focus-menu-item" data-tone="${b.tone}" href="#/focus/${r.date}/${blockKey(b)}" data-action="close-sheet"><b><i></i>${clock(b.start)} ${b.title}</b><span>${b.periodText}${s ? ` · 有效 ${duration(effectiveMinutes(s))}` : ''}</span></a>`
          })}
          ${r.live ? html`<a class="focus-menu-item" href="#/focus/${r.date}/free" data-action="close-sheet"><b>自由专注</b><span>不跟课表，自己定预估时间</span></a>` : ''}
        </nav>
      </div>`)
    }
  },
  inputs: {
    'focus-note': ({ ctx, value }) => {
      const r = resolve(ctx)
      if (r.session) {
        const id = r.session.id
        ctx.update(s => {
          s.sessions.find(x => x.id === id).note = value
        }, { render: false })
      } else drafts[r.view === 'free' ? 'free' : blockKey(r.target)] = value
    },
    'focus-free-title': ({ value }) => {
      freeTitle = value
    }
  }
}
