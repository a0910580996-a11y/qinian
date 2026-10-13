import { html, vars, pct } from '../core/html.js'
import { clock, cnNumber, duration, hours, nowMinutes, todayKey, formatMonthDay, WEEKDAYS } from '../core/dates.js'
import { yuan } from '../core/money.js'
import { coursesFor, locateNow } from '../domain/schedule.js'
import { blockKey, sessionFor, sessionStatus, effectiveMinutes, attendance } from '../domain/focus.js'
import { lifePosition } from '../domain/life.js'
import { parseLog, summarize } from '../domain/timelog.js'
import { dailyPick, itemCode } from '../domain/library.js'
import { icon } from '../ui/icons.js'
import { dateNav } from '../ui/parts.js'
import { activeSkill } from '../ui/shared.js'
import { backupDue, folderSupported } from '../ui/backup.js'
import { displayName } from '../domain/seed.js'
import { avatar } from '../ui/avatar.js'
import { field } from '../ui/parts.js'
import { isValidKey } from '../core/dates.js'

function greeting(hour) {
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function lifeStrip(pos) {
  if (!pos) return ''
  return html`<a class="lifestrip" href="#/milestones" title="${pos.life.name}：${pos.life.start} 至 ${pos.life.end}">
    <span class="lifestrip-bars">${Array.from({ length: 7 }, (_, i) => {
      const n = i + 1
      if (n < pos.year) return html`<i class="is-full"></i>`
      if (n === pos.year) return html`<i class="is-now" data-vars="${vars({ w: pct(pos.yearDay, pos.yearDays) })}"></i>`
      return html`<i></i>`
    })}</span>
    <span class="lifestrip-text">第${cnNumber(pos.year)}年 · 第 ${pos.day} / ${pos.life.days} 天</span>
  </a>`
}

function gapName(from, to) {
  if (from <= 12 * 60 + 30 && to >= 13 * 60) return '午间'
  if (from <= 18 * 60 + 30 && to >= 18 * 60 + 30) return '傍晚'
  return '空档'
}

// 签到状态：专注中 / 有效多少 / 未签到；正在上的课提示点进去开始。
function attendLine(session, status, past) {
  if (session) {
    const st = sessionStatus(session)
    if (st === 'ended') return html`<div class="slot-attend is-done">${icon('check')}有效 ${duration(effectiveMinutes(session))}${session.note ? ` · ${session.note}` : ''}</div>`
    return html`<div class="slot-attend is-live"><span class="live-dot"></span>${st === 'paused' ? '暂停中' : '专注中'} · 有效 ${duration(effectiveMinutes(session))}</div>`
  }
  if (status === 'now') return html`<div class="slot-attend is-hint">点这里签到，开始专注 →</div>`
  if (past) return html`<div class="slot-attend is-miss">未签到</div>`
  return ''
}

function slot(block, status, now, showNote = true, ctx = null) {
  const length = block.end - block.start
  const date = ctx?.date
  const isToday = date === ctx?.today
  const session = ctx ? sessionFor(ctx.state.sessions, date, blockKey(block)) : null
  // 正在上和下一段跳到“跟随课表”的专注页（下课自动换到下一段）；其余段打开那一段的记录。
  const href = isToday && (status === 'now' || status === 'next') ? '#/focus' : `#/focus/${date}/${blockKey(block)}`
  return html`<li class="slot ${status ? 'is-' + status : ''}" data-tone="${block.tone}">
    <div class="slot-time"><b>${clock(block.start)}</b><span>${clock(block.end)}</span></div>
    <a class="slot-card" href="${href}">
      <div class="slot-top">
        <span class="slot-title">${block.title}</span>
        <span class="slot-period">${block.periodText}</span>
      </div>
      <div class="slot-place ${block.tentative ? 'is-tentative' : ''}">${icon('pin')}<span>${block.place || '地点待定'}</span>${block.confirm ? html`<span class="tag">待确认</span>` : ''}</div>
      ${block.segments?.length > 1 ? html`<p class="slot-segments">${block.segments.map((sg, i) => html`${i ? html`<span class="slot-break">课间 ${sg.start - block.segments[i - 1].end}′</span>` : ''}<span>${clock(sg.start)}–${clock(sg.end)}</span>`)}</p>` : ''}
      ${block.note && showNote ? html`<p class="slot-note">${block.note}</p>` : ''}
      ${status === 'now'
        ? html`<div class="slot-live"><span class="live-dot"></span>${(() => {
            const segs = block.segments || []
            const inner = segs.findIndex((sg, i) => i > 0 && now >= segs[i - 1].end && now < sg.start)
            return inner > 0 ? `课间 · ${duration(segs[inner].start - now)}后上${segs[inner].label}` : `进行中 · 还剩 ${duration(block.end - now)}`
          })()}</div><div class="slot-progress"><i data-vars="${vars({ w: pct(now - block.start, length) })}"></i></div>`
        : status === 'next'
          ? html`<div class="slot-live is-soon">${duration(block.start - now)}后开始</div>`
          : ''}
      ${ctx ? attendLine(session, status, status === 'past' || (!isToday && date < ctx.today)) : ''}
    </a>
  </li>`
}

function nowLine(now, next) {
  return html`<li class="now-line"><span class="now-time">${clock(now)}</span><span class="now-rule"></span><span class="now-text">${next ? `距离 ${next.title} 还有 ${duration(next.start - now)}` : '今天的安排都结束了'}</span></li>`
}

function timeline(blocks, isToday, now, ctx) {
  const { current, next } = locateNow(blocks, now)
  const items = []
  let placed = !isToday || current >= 0
  blocks.forEach((block, i) => {
    const prev = blocks[i - 1]
    if (!placed && now < block.start) {
      items.push(nowLine(now, block))
      placed = true
    } else if (prev && block.start - prev.end >= 30) {
      items.push(html`<li class="gap"><span>${gapName(prev.end, block.start)} · ${duration(block.start - prev.end)}</span></li>`)
    }
    const status = !isToday ? '' : i === current ? 'now' : block.end <= now ? 'past' : i === next && current < 0 ? 'next' : ''
    items.push(slot(block, status, now, !prev || prev.note !== block.note, ctx))
  })
  if (!placed) items.push(nowLine(now, null))
  return html`<ol class="timeline">${items}</ol>`
}

function dayBody(ctx, animate) {
  const { state, today } = ctx
  const key = ctx.date
  const day = coursesFor(state.schedule, key)
  const now = nowMinutes()
  const isToday = key === today
  let summary
  let body
  if (day.status === 'ok') {
    const first = day.blocks[0]
    const last = day.blocks[day.blocks.length - 1]
    const periods = day.blocks.reduce((s, b) => s + b.periods.length, 0)
    const a = attendance(day.blocks, state.sessions, key, { minutes: isToday ? now : key < today ? Infinity : -1 })
    summary = html`${day.blocks.length} 段 · ${periods} 节 · ${clock(first.start)}–${clock(last.end)}${a.due ? html` · <a class="summary-link" href="${isToday ? '#/focus' : `#/focus/${key}/${blockKey(first)}`}">出勤 ${a.attended}/${a.due}${a.effective ? ` · 有效 ${duration(a.effective)}` : ''}</a>` : ''}${day.shifted ? html` · <span class="tag">按周${WEEKDAYS[day.day]}课表${day.label ? '（' + day.label + '）' : ''}</span>` : ''}`
    body = timeline(day.blocks, isToday, now, ctx)
  } else if (day.status === 'off') {
    summary = '停课'
    body = html`<div class="day-empty"><p class="day-empty-title">${day.label}</p><p>这一天的课程表不生效。</p></div>`
  } else if (day.status === 'out') {
    summary = '学期外'
    body = html`<div class="day-empty"><p class="day-empty-title">不在本学期内</p><p>本学期从 ${formatMonthDay(state.schedule.semester.start)} 开始，共 ${state.schedule.semester.weeks} 周。可以在 <a href="#/settings">设置</a> 里调整。</p></div>`
  } else {
    summary = '没有课程安排'
    const noSchedule = !Object.values(state.schedule.slots || {}).some(d => Object.keys(d || {}).length)
    body = noSchedule
      ? html`<div class="day-empty"><p class="day-empty-title">还没有课程表</p><p>在 <a href="#/settings">设置 → 课程表</a> 里填上每周的课，这里就会按天显示，点课还能签到专注。</p></div>`
      : html`<div class="day-empty"><p class="day-empty-title">${[0, 6].includes(day.day) ? '周末，留给自己' : '今天没有课程安排'}</p><p>没有安排的日子，也可以过得很好。</p></div>`
  }
  return html`<div class="day-body ${animate && ctx.direction ? 'slide-' + ctx.direction : ''}">
    <p class="day-summary">${summary}</p>
    ${body}
  </div>`
}

function records(ctx) {
  const { state } = ctx
  const key = ctx.date
  const isToday = key === ctx.today
  const thanks = (state.gratitude[key] || []).filter(t => t?.trim()).length
  const log = state.timelog[key]?.text?.trim() ? summarize(parseLog(state.timelog[key].text).entries) : null
  const skill = activeSkill(state)
  const practiced = skill ? state.practice.filter(p => p.skillId === skill.id && p.date === key).reduce((s, p) => s + p.minutes, 0) : 0
  const spent = state.ledger.entries.filter(e => e.date === key && e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const income = state.ledger.entries.filter(e => e.date === key && e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const reviewHref = isToday ? '#/review' : `#/review/${key}`
  return html`<section class="records">
    <h2 class="section-title">${isToday ? '今天的记录' : formatMonthDay(key) + '的记录'}</h2>
    <div class="tiles">
      <a class="tile" href="${reviewHref}">
        <span class="tile-icon">${icon('heart')}</span><span class="tile-label">感恩</span>
        <span class="tile-value ${thanks ? '' : 'is-quiet'}">${thanks ? `${thanks} / 3` : '还没写'}</span>
      </a>
      <a class="tile" href="${reviewHref}">
        <span class="tile-icon">${icon('clock')}</span><span class="tile-label">时间日志</span>
        <span class="tile-value ${log ? '' : 'is-quiet'}">${log ? `${hours(log.total)} 小时` : isToday ? '今晚写' : '没有记录'}</span>
      </a>
      <button class="tile" data-action="add-practice" data-value="${key}">
        <span class="tile-icon">${icon('flame')}</span><span class="tile-label">${skill ? skill.name : '修炼'}</span>
        <span class="tile-value ${practiced ? '' : 'is-quiet'}">${practiced ? duration(practiced) : '＋ 记录'}</span>
      </button>
      <button class="tile" data-action="add-entry" data-value="${key}">
        <span class="tile-icon">${icon('wallet')}</span><span class="tile-label">账本</span>
        <span class="tile-value ${spent || income ? '' : 'is-quiet'}">${spent ? `支出 ${yuan(spent)}` : income ? `收入 ${yuan(income)}` : '＋ 记一笔'}</span>
      </button>
    </div>
  </section>`
}

function scroll(ctx) {
  const { state } = ctx
  const item = dailyPick(state.library.items, ctx.date)
  if (!item) return html`<section class="scroll is-empty"><p>图书馆里还没有残卷。<a href="#/library">收录第一句击中你的话</a></p></section>`
  const uses = state.library.uses.filter(u => u.itemId === item.id).length
  return html`<section class="scroll">
    <div class="scroll-head"><span class="eyebrow">${ctx.date === ctx.today ? '今日一卷' : '这一天的一卷'}</span><a class="scroll-code" href="#/library">${itemCode(item)}</a></div>
    <blockquote class="scroll-text">${item.text}</blockquote>
    <div class="scroll-foot">
      <span class="scroll-source">${state.settings.show.source && item.source ? '—— ' + item.source : ''}${uses ? html`<span class="scroll-uses"> · 已用上 ${uses} 次</span>` : ''}</span>
      <button class="btn quiet" data-action="use-item" data-id="${item.id}">${icon('check')}用上了</button>
    </div>
  </section>`
}

function nudge(state, today) {
  const due = backupDue(state, today)
  if (!due) return ''
  const folder = folderSupported() && state.settings.backup?.folder
  return html`<section class="nudge-card">
    ${icon('download')}
    <p>${due.never ? '还没有备份过' : `上次备份是 ${due.since} 天前`}。记录现在只在这台设备的浏览器里，存一份到百度网盘才算稳。</p>
    ${folder ? html`<button class="btn quiet sm" data-action="backup-now">立即备份</button>` : html`<a class="btn quiet sm" href="#/settings">去备份</a>`}
  </section>`
}

// 第一次打开：自己填资料，或者连接同步、从备份恢复，取回自己的记录。
function welcome(ctx) {
  if (ctx.state.profile.name) return ''
  return html`<section class="card welcome">
    <p class="eyebrow">七年就是一辈子</p>
    <h2 class="welcome-title">先认识一下你</h2>
    <p class="muted">已经在别的设备上用过？到 <a href="#/settings">设置</a> 里连接同步，或者从备份恢复，记录会自己回来。第一次用的话，填下面几样就好，之后都能改。</p>
    <form data-form="welcome" class="welcome-form">
      ${field('名字', html`<input name="name" class="input" maxlength="20" autocomplete="off" required>`)}
      ${field('昵称（可不填）', html`<input name="en" class="input" maxlength="20" autocomplete="off" placeholder="问候时用，比如英文名">`)}
      ${field('生日', html`<input name="birthday" type="date" class="input">`)}
      ${field('这一辈子从哪天开始', html`<input name="lifeStart" type="date" class="input" value="${ctx.today}">`, '七年为一辈子，可以从任何一天重新开始')}
      ${field('这辈子的主题（可不填）', html`<input name="theme" class="input" maxlength="30" autocomplete="off" placeholder="比如：财务稳健">`)}
      <button class="btn primary">开始</button>
    </form>
  </section>`
}

export default {
  render(ctx) {
    const { state, today } = ctx
    const key = ctx.date
    const pos = lifePosition(state.lives, today)
    const day = coursesFor(state.schedule, key)
    return html`
      ${welcome(ctx)}
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">${pos ? `${pos.life.name}${pos.life.theme ? ' · ' + pos.life.theme : ''}` : state.profile.name}</p>
          <div class="greet-row">
            ${state.profile.name ? html`<a class="greet-avatar" href="#/settings" aria-label="编辑资料">${avatar(state.profile, 48)}</a>` : ''}
            <div>
              <h1 class="greet">${greeting(new Date().getHours())}${displayName(state.profile) ? `，${displayName(state.profile)}` : ''}</h1>
              ${state.profile.signature?.trim() ? html`<p class="signature">${state.profile.signature.trim()}</p>` : ''}
            </div>
          </div>
        </div>
        ${lifeStrip(pos)}
      </section>
      <section class="day-card">
        ${dateNav(key, today, day.week ? ` · 第${day.week}周` : '')}
        <div data-region="day">${dayBody(ctx, true)}</div>
      </section>
      <div class="today-lower">
        ${records(ctx)}
        ${scroll(ctx)}
      </div>
      ${nudge(state, today)}
    `
  },
  mount(root, ctx) {
    const openedOn = todayKey()
    const timer = setInterval(() => {
      if (todayKey() !== openedOn) return ctx.rerender()
      if (ctx.date === ctx.today) ctx.patch('day', dayBody(ctx, false))
    }, 30000)
    return () => clearInterval(timer)
  },
  forms: {
    welcome: ({ data, ctx }) => {
      const name = data.name.trim()
      if (!name) return ctx.toast('写下名字')
      const birthday = isValidKey(data.birthday) ? data.birthday : ''
      const lifeStart = isValidKey(data.lifeStart) ? data.lifeStart : ctx.today
      ctx.update(s => {
        s.profile = { ...s.profile, name, en: data.en.trim(), birthday }
        // 有生日且这一辈子晚于出生：出生到这一辈子之前算作上一段，这一辈子从填的日子起算七年。
        s.lives = birthday && lifeStart > birthday ? [{ start: birthday, theme: '' }, { start: lifeStart, theme: data.theme.trim() }] : [{ start: lifeStart, theme: data.theme.trim() }]
      })
      ctx.toast(`你好，${data.en.trim() || name}`)
    }
  }
}
