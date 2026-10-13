import { html, vars, pct } from '../core/html.js'
import { duration, hours, clock, cnNumber } from '../core/dates.js'
import { coursesFor, blocksToLog } from '../domain/schedule.js'
import { sessionsToLog } from '../domain/focus.js'
import { parseLog, summarize, ribbon, minutesOf, TIME_KINDS } from '../domain/timelog.js'
import { icon } from '../ui/icons.js'
import { dateNav, pageHead } from '../ui/parts.js'
import { activeSkill } from '../ui/shared.js'

const PLACEHOLDER = `00:30-07:10 睡眠
07:10-07:50 早读 普通话
08:00-09:40 上课 数学分析
12:00-12:40 吃饭
19:30-21:00 练习 讲一道几何题
40m 短视频`

const THANKS_HINTS = ['今天谁帮了你，或者什么让你安心？', '有什么小事让你觉得幸运？', '今天的自己，有哪一点值得感谢？']

function preview(text) {
  const { entries, errors } = parseLog(text)
  if (!entries.length && !errors.length) return html`<p class="log-empty">一行一件事，写下今天的时间去了哪里。右上角可以先按课程表起个草稿。</p>`
  const sum = summarize(entries)
  const max = sum.categories[0]?.minutes || 1
  return html`
    <div class="ribbon" aria-hidden="true">${ribbon(entries).map(s => html`<i data-cat="${s.category}" data-vars="${vars({ x: pct(s.from, 1440), w: pct(s.to - s.from, 1440) })}" title="${clock(s.from)}–${clock(s.to)}"></i>`)}</div>
    <div class="ribbon-scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    <div class="kinds">${TIME_KINDS.filter(k => sum.byKind[k.id]).map(k => html`<span class="kind" data-kind="${k.id}" title="${k.hint}"><i></i>${k.name}<b>${hours(sum.byKind[k.id])}h</b></span>`)}</div>
    <ul class="cat-list">${sum.categories.map(c => html`<li data-cat="${c.id}"><span class="cat-name"><i></i>${c.name}</span><span class="cat-bar"><b data-vars="${vars({ w: pct(c.minutes, max) })}"></b></span><span class="cat-time">${duration(c.minutes)}</span></li>`)}</ul>
    <p class="log-total">共 ${duration(sum.total)}</p>
    ${errors.length ? html`<ul class="log-errors">${errors.map(e => html`<li>第 ${e.line} 行「${e.text}」${e.reason}，这一行没有计入</li>`)}</ul>` : ''}
  `
}

function practice(ctx) {
  const { state } = ctx
  const key = ctx.date
  const skill = activeSkill(state)
  if (!skill) return html`<p class="muted">还没定下这辈子要修炼的技能。<a href="#/skill">去定下</a></p>`
  const list = state.practice.filter(p => p.skillId === skill.id && p.date === key)
  const recorded = list.reduce((s, p) => s + p.minutes, 0)
  const text = state.timelog[key]?.text || ''
  const fromLog = minutesOf(parseLog(text).entries, 'practice')
  return html`
    <p class="practice-today">${recorded ? html`<b>${duration(recorded)}</b><span>已记入「${skill.name}」</span>` : html`<span class="muted">这一天还没有记录</span>`}</p>
    ${list.length ? html`<ul class="mini-list">${list.map(p => html`<li><span>${duration(p.minutes)}</span><span class="muted">${p.note}</span><button class="icon-btn sm" data-action="delete-practice" data-id="${p.id}" aria-label="删除">${icon('close')}</button></li>`)}</ul>` : ''}
    <div class="practice-actions">
      ${fromLog > 0 && fromLog !== recorded ? html`<button class="btn soft" data-action="add-practice" data-value="${key}" data-minutes="${fromLog - recorded > 0 ? fromLog - recorded : fromLog}">日志里有「练习」${duration(fromLog)} · 记入</button>` : ''}
      <button class="btn quiet" data-action="add-practice" data-value="${key}">${icon('plus')}记录练习</button>
    </div>`
}

function autosize(el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 2 + 'px'
}

function saveLog(ctx, text) {
  const key = ctx.date
  ctx.update(
    s => {
      if (text.trim()) s.timelog[key] = { text, updatedAt: new Date().toISOString() }
      else delete s.timelog[key]
    },
    { render: false }
  )
  ctx.patch('log-preview', preview(text))
  ctx.patch('practice', practice(ctx))
  ctx.patch('log-saved', html`已保存 ${clock(new Date().getHours() * 60 + new Date().getMinutes())}`)
}

export default {
  render(ctx) {
    const { state, today } = ctx
    const key = ctx.date
    const text = state.timelog[key]?.text || ''
    const thanks = state.gratitude[key] || []
    const day = coursesFor(state.schedule, key)
    return html`
      ${pageHead('复盘', '每晚敲进去，算是对这一天的回望')}
      <section class="day-card compact">${dateNav(key, today, day.week ? ` · 第${day.week}周` : '')}</section>
      <div class="review-grid">
        <section class="card log-card">
          <div class="card-head">
            <h2 class="card-title">时间日志</h2>
            <span class="card-hint" data-region="log-saved"></span>
            <span class="grow"></span>
            <button class="btn quiet sm" data-action="log-from-schedule" ${day.blocks.length || state.sessions.some(s => s.date === key) ? '' : 'disabled'}>${icon('calendar')}${state.sessions.some(s => s.date === key) ? '按签到记录起草' : '按课程表起草'}</button>
          </div>
          <textarea class="log-input" data-input="timelog" spellcheck="false" autocomplete="off" placeholder="${PLACEHOLDER}">${text}</textarea>
          <details class="help">
            <summary>怎么写</summary>
            <ul>
              <li><code>07:10-08:00 早读 普通话</code>：开始-结束，类别，备注。<code>0710-0800</code>、<code>7:10~8:00</code> 也可以。</li>
              <li><code>23:30-07:00 睡眠</code>：跨过午夜会自动算。</li>
              <li><code>45m 短视频</code>、<code>1.5h 练习</code>：记不清具体时刻时，只写时长。</li>
              <li>类别：上课、自学、练习、阅读、运动、工作、睡眠、生活、社交、休息、短视频。常见说法也能认出，比如“跑步”算运动、“家教”算工作、“抖音”算短视频。</li>
              <li>以 <code>#</code> 开头的行是备注，不计时。</li>
            </ul>
          </details>
          <div class="log-preview" data-region="log-preview">${preview(text)}</div>
        </section>
        <div class="review-side">
          <section class="card">
            <div class="card-head"><h2 class="card-title">感恩</h2><span class="card-hint">值得感恩的三件事</span></div>
            <ol class="thanks">
              ${[0, 1, 2].map(i => html`<li><span class="thanks-no">${cnNumber(i + 1)}</span><textarea rows="1" class="thanks-input" data-input="thanks" data-index="${i}" maxlength="200" placeholder="${THANKS_HINTS[i]}">${thanks[i] || ''}</textarea></li>`)}
            </ol>
          </section>
          <section class="card">
            <div class="card-head"><h2 class="card-title">修炼</h2><span class="card-hint">刻意练习的有效时长</span></div>
            <div data-region="practice">${practice(ctx)}</div>
          </section>
        </div>
      </div>`
  },
  mount(root) {
    root.querySelectorAll('.thanks-input').forEach(autosize)
  },
  inputs: {
    timelog: ({ el, ctx }) => saveLog(ctx, el.value),
    thanks: ({ el, ctx }) => {
      autosize(el)
      const key = ctx.date
      const index = Number(el.dataset.index)
      ctx.update(
        s => {
          const list = [...(s.gratitude[key] || ['', '', ''])]
          list[index] = el.value
          if (list.some(t => t?.trim())) s.gratitude[key] = list
          else delete s.gratitude[key]
        },
        { render: false }
      )
    }
  },
  actions: {
    'log-from-schedule': ({ ctx }) => {
      const area = document.querySelector('.log-input')
      // 有签到记录就用实际的开始结束时间和“在做什么”；没有才按课程表。
      const sessions = ctx.state.sessions.filter(s => s.date === ctx.date)
      const categoryOf = s => (s.tone === 'gray' ? '上课' : /家教|教学/.test(s.title) ? '工作' : '自学')
      const draft = sessions.length ? sessionsToLog(sessions, ctx.date, categoryOf) : blocksToLog(coursesFor(ctx.state.schedule, ctx.date).blocks)
      if (!draft) return
      const current = area.value.trimEnd()
      area.value = current ? `${current}\n${draft}` : draft
      saveLog(ctx, area.value)
      area.focus()
      ctx.toast(current ? '课程草稿已追加在末尾，按实际情况改一改' : '按课程表起了草稿，按实际情况改一改')
    },
    'delete-practice': ({ ctx, id }) =>
      ctx.undoable('已删除这条练习记录', s => {
        s.practice = s.practice.filter(p => p.id !== id)
      })
  }
}
