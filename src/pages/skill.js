import { html, vars, pct } from '../core/html.js'
import { hours, duration, formatDot, formatMonthDay, formatFull, cnNumber, isValidKey, weekdayShort, diffDays } from '../core/dates.js'
import { uid } from '../core/store.js'
import { lifePosition, lifeYears, normalizeLives } from '../domain/life.js'
import { REALMS, realmOf, practiceOf, totalMinutes, pace, neededPerDay, byDay, activeDays, TARGET_MINUTES } from '../domain/skill.js'
import { icon } from '../ui/icons.js'
import { pageHead, heatmap, stat, field, sheetHead, sheetActions } from '../ui/parts.js'
import { activeSkill } from '../ui/shared.js'

function onboarding(ctx) {
  return html`<section class="card onboarding">
    <p class="eyebrow">一万小时</p>
    <h2 class="onboarding-title">这辈子，修炼哪一门功夫？</h2>
    <p class="onboarding-text">只选一项。每天记下刻意练习的有效时长——真正专注、有反馈、略超出舒适区的那部分，不算“在场”的时间。七年后回头看，看它是否走到一万小时。</p>
    <form data-form="skill-new" class="onboarding-form">
      <input name="name" class="input input-lg" maxlength="30" autocomplete="off" placeholder="例如：数学教学" required autofocus>
      <input name="start" type="date" class="input" value="${ctx.today}" aria-label="开始日期">
      <button class="btn primary">立下</button>
    </form>
  </section>`
}

function realmTrack(realm) {
  return html`<ol class="realms">${REALMS.map((r, i) => {
    const state = i < realm.index ? 'is-past' : i === realm.index ? 'is-now' : ''
    const fill = i < realm.index ? '100%' : i === realm.index ? pct(realm.progress, 1) : '0%'
    return html`<li class="realm ${state}">
      <span class="realm-dot"></span>
      ${i < REALMS.length - 1 ? html`<span class="realm-track"><i data-vars="${vars({ w: fill })}"></i></span>` : ''}
      <span class="realm-name">${r.name}</span>
      <span class="realm-hours">${r.hours ? r.hours.toLocaleString('zh-CN') + 'h' : '起点'}</span>
    </li>`
  })}</ol>`
}

export default {
  render(ctx) {
    const { state, today } = ctx
    const skill = activeSkill(state)
    const head = pageHead('修炼', '一万小时，只累加，不清零', skill ? html`<button class="btn primary" data-action="add-practice">${icon('plus')}记录练习</button>` : '')
    if (!skill) return html`${head}${onboarding(ctx)}`
    const list = practiceOf(state.practice, skill.id)
    const total = totalMinutes(list)
    const realm = realmOf(total)
    const pos = lifePosition(state.lives, today)
    const life = pos?.life || normalizeLives(state.lives).at(-1)
    const years = lifeYears(life)
    const yearIndex = Math.min(years.length, Math.max(1, Number(ctx.params[0]) || pos?.year || 1))
    const year = years[yearIndex - 1]
    // 近期节奏的窗口从技能开始日算起，最长 30 天；不足 7 天不推算，免得一两天的数据给出离谱的年份。
    const window = Math.min(30, Math.max(1, diffDays(skill.start, today) + 1))
    const p = pace(list, today, window)
    const canProject = window >= 7 && p.perDay > 0
    const needed = neededPerDay(total, today, life.end)
    const recent = [...list].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 12)
    const yearMinutes = list.filter(x => x.date >= year.start && x.date <= year.end).reduce((s, x) => s + x.minutes, 0)
    return html`
      ${head}
      <section class="card skill-hero">
        <div class="skill-hero-top">
          <div>
            <p class="eyebrow">${life.name}的修炼 · 始于 ${formatDot(skill.start)}</p>
            <h2 class="skill-name">${skill.name}</h2>
          </div>
          <button class="icon-btn" data-action="skill-edit" aria-label="编辑技能">${icon('edit')}</button>
        </div>
        <div class="skill-total"><span class="big-num">${hours(total)}</span><span class="unit">小时</span><span class="of">/ 10,000</span></div>
        <div class="skill-progress">${html`<i data-vars="${vars({ w: pct(total, TARGET_MINUTES) })}"></i>`}</div>
        ${realmTrack(realm)}
        <p class="realm-line">当前境界 <b>${realm.current.name}</b>${realm.next ? html` · 距「${realm.next.name}」还有 ${hours(realm.toNext)} 小时` : ' · 一万小时，功成'}</p>
      </section>
      <section class="stats-row">
        ${stat(window < 30 ? `近 ${window} 天日均` : '近 30 天日均', p.perDay ? `${hours(p.perDay, 1)} 小时` : '—')}
        ${stat('练习天数', `${activeDays(list)} 天`)}
        ${stat('按近期节奏', canProject ? formatFull(p.eta).replace(/月\d+日$/, '月') : '—', canProject ? '走到一万小时' : '记录满 7 天后推算')}
        ${stat('参考', `${hours(needed, 1)} 小时/天`, `本辈子内达成所需日均`)}
      </section>
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">第${cnNumber(yearIndex)}年</h2>
          <span class="card-hint">${hours(yearMinutes)} 小时</span>
          <span class="pager">
            <a class="icon-btn sm ${yearIndex <= 1 ? 'is-disabled' : ''}" href="#/skill/${yearIndex - 1}" aria-label="上一年">${icon('left')}</a>
            <a class="icon-btn sm ${yearIndex >= years.length ? 'is-disabled' : ''}" href="#/skill/${yearIndex + 1}" aria-label="下一年">${icon('right')}</a>
          </span>
          <p class="card-range">${formatDot(year.start)} – ${formatDot(year.end)}</p>
        </div>
        ${heatmap({ from: year.start, to: year.end, today, values: byDay(list), thresholds: [30, 90, 180], describe: v => (v ? duration(v) : '未练习') })}
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">最近的练习</h2></div>
        ${recent.length
          ? html`<ul class="practice-list">${recent.map(x => html`<li><span class="practice-date">${formatMonthDay(x.date)} <span class="muted">${weekdayShort(x.date)}</span></span><span class="practice-note">${x.note || html`<span class="muted">—</span>`}</span><span class="practice-min">${duration(x.minutes)}</span><button class="icon-btn sm" data-action="delete-practice" data-id="${x.id}" aria-label="删除">${icon('close')}</button></li>`)}</ul>`
          : html`<p class="muted">还没有记录。第一个小时，从今天开始。</p>`}
      </section>`
  },
  actions: {
    'skill-edit': ({ ctx }) => {
      const skill = activeSkill(ctx.state)
      const past = ctx.state.skills.filter(s => s.id !== skill.id)
      ctx.openSheet(html`<form data-form="skill-edit" class="sheet-form">
        ${sheetHead('编辑技能')}
        ${field('技能名称', html`<input name="name" class="input" maxlength="30" value="${skill.name}" autocomplete="off">`)}
        ${field('开始日期', html`<input name="start" type="date" class="input" value="${skill.start}">`)}
        ${past.length ? html`<p class="muted small">过去的修炼：${past.map(s => `${s.name}（${hours(totalMinutes(practiceOf(ctx.state.practice, s.id)))} 小时）`).join('、')}</p>` : ''}
        ${sheetActions('保存', html`<button type="button" class="btn quiet" data-action="skill-new-start">换一门修炼</button>`)}
      </form>`)
    },
    'skill-new-start': ({ ctx }) => {
      ctx.openSheet(html`<form data-form="skill-new" class="sheet-form">
        ${sheetHead('换一门修炼', '原来的记录会保留，只是不再作为当前技能')}
        ${field('新技能', html`<input name="name" class="input input-lg" maxlength="30" autocomplete="off" required autofocus>`)}
        ${field('开始日期', html`<input name="start" type="date" class="input" value="${ctx.today}">`)}
        ${sheetActions('立下')}
      </form>`)
    },
    'delete-practice': ({ ctx, id }) =>
      ctx.undoable('已删除这条练习记录', s => {
        s.practice = s.practice.filter(p => p.id !== id)
      })
  },
  forms: {
    'skill-new': ({ data, ctx }) => {
      const name = data.name.trim()
      if (!name) return ctx.toast('写下技能名称')
      ctx.update(s => {
        s.skills.forEach(x => (x.active = false))
        s.skills.push({ id: uid(), name, start: isValidKey(data.start) ? data.start : ctx.today, active: true })
      })
      ctx.closeSheet()
      ctx.toast(`立下了：${name}`)
    },
    'skill-edit': ({ data, ctx }) => {
      const name = data.name.trim()
      if (!name) return ctx.toast('名称不能为空')
      ctx.update(s => {
        const skill = activeSkill(s)
        skill.name = name
        if (isValidKey(data.start)) skill.start = data.start
      })
      ctx.closeSheet()
    }
  }
}
