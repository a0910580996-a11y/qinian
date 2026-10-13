import { html, vars, pct } from '../core/html.js'
import { formatDot, diffDays, isValidKey, todayKey } from '../core/dates.js'
import { uid } from '../core/store.js'
import { withFuture, lifeOf, ageOn } from '../domain/life.js'
import { NODE_KINDS, STATUSES, statusName, childrenOf, progress, lifeOfNode, crossing, achievements, academicYears, rootOf } from '../domain/milestones.js'
import { icon } from '../ui/icons.js'
import { pageHead, meter, field, sheetHead, sheetActions, options } from '../ui/parts.js'

const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo', paused: 'doing' }
let justDone = null

// 顶部的“一生”色带：每辈子一段，段与段之间留一道缝——连续，但分得清。
function ribbon(lives, nodes, today, profile) {
  const shown = lives
  const weights = shown.map(l => (l.future ? 1 : today >= l.start && today <= l.end ? 2.4 : 1.2))
  const done = achievements(nodes)
  return html`<div class="life-ribbon">${shown.map((life, i) => {
    const current = today >= life.start && today <= life.end
    const at = key => pct(diffDays(life.start, key), life.days - 1)
    const marks = done.filter(n => n.doneAt >= life.start && n.doneAt <= life.end)
    const stages = current ? academicYears(profile.enrollYear).filter(s => s.end >= life.start && s.start <= life.end) : []
    return html`<div class="life-seg ${current ? 'is-current' : ''} ${life.future ? 'is-future' : ''}" data-vars="${vars({ f: weights[i] })}">
      <div class="life-seg-label"><b>${life.name}</b><span>${life.start.slice(0, 4)}–${life.end.slice(0, 4)}</span></div>
      <div class="life-seg-bar">
        ${current ? html`<i class="life-fill" data-vars="${vars({ w: at(today) })}"></i><span class="life-today" data-vars="${vars({ x: at(today) })}" title="今天"></span>` : !life.future ? html`<i class="life-fill" data-vars="w:100%"></i>` : ''}
        ${marks.map(n => html`<span class="life-mark" data-vars="${vars({ x: at(n.doneAt) })}" title="${formatDot(n.doneAt)} ${n.title}"></span>`)}
      </div>
      ${stages.length ? html`<div class="life-stages">${stages.map(s => {
        const from = s.start < life.start ? life.start : s.start
        return html`<span data-vars="${vars({ x: at(from), w: pct(diffDays(from, s.end), life.days - 1) })}" class="${today >= s.start && today <= s.end ? 'is-now' : ''}">${s.label}</span>`
      })}</div>` : ''}
    </div>`
  })}</div>`
}

function statusDot(node) {
  const pop = node.id === justDone ? ' just-done' : ''
  return html`<button class="status-dot is-${node.status}${pop}" data-action="cycle-status" data-id="${node.id}" title="${statusName(node.status)}，点一下切换" aria-label="状态：${statusName(node.status)}">${node.status === 'done' ? icon('check') : ''}</button>`
}

function dates(node) {
  const parts = []
  if (node.status === 'done' && node.doneAt) parts.push(`${formatDot(node.doneAt)} 达成`)
  else if (node.due) parts.push(`目标 ${formatDot(node.due)}`)
  return parts.join(' · ')
}

function projectRows(nodes, parentId, lives, depth = 0) {
  return childrenOf(nodes, parentId).map(node => {
    const kids = childrenOf(nodes, node.id)
    const p = kids.length ? progress(nodes, node.id) : null
    const cross = crossing(lives, node)
    return html`<li class="node depth-${depth} is-${node.status}">
      <div class="node-row">
        ${statusDot(node)}
        <button class="node-title" data-action="node-edit" data-id="${node.id}">${node.title}</button>
        ${p ? html`<span class="node-count">${p.done}/${p.total}</span>` : ''}
        ${cross ? html`<span class="tag tag-cross">延续至${cross.name}</span>` : ''}
        <span class="node-date">${dates(node)}</span>
        <button class="icon-btn sm node-add" data-action="node-new" data-value="${node.id}" aria-label="添加子项" title="添加子项">${icon('plus')}</button>
      </div>
      ${node.note ? html`<p class="node-note">${node.note}</p>` : ''}
      ${kids.length ? html`<ul class="nodes">${projectRows(nodes, node.id, lives, depth + 1)}</ul>` : ''}
    </li>`
  })
}

function goalCard(nodes, goal, lives) {
  const p = progress(nodes, goal.id)
  const cross = crossing(lives, goal)
  return html`<article class="goal is-${goal.status}">
    <header class="goal-head">
      ${statusDot(goal)}
      <div class="goal-main">
        <button class="goal-title" data-action="node-edit" data-id="${goal.id}">${goal.title}</button>
        <p class="goal-meta">${[goal.start && goal.due ? `${formatDot(goal.start)} – ${formatDot(goal.due)}` : dates(goal), goal.note].filter(Boolean).join(' · ')}</p>
      </div>
      ${cross ? html`<span class="tag tag-cross">延续至${cross.name}</span>` : ''}
      <button class="icon-btn sm" data-action="node-new" data-value="${goal.id}" aria-label="添加子目标" title="添加子目标">${icon('plus')}</button>
    </header>
    ${p.total ? html`<div class="goal-progress">${meter(p.done, p.total, 'gold')}<span>${p.done} / ${p.total} 项达成</span></div>` : ''}
    <ul class="nodes">${projectRows(nodes, goal.id, lives)}</ul>
  </article>`
}

function lifeSection(life, nodes, lives, today, profile) {
  const current = today >= life.start && today <= life.end
  const goals = childrenOf(nodes, null).filter(n => n.kind !== 'event' && lifeOfNode(lives, n, lives.find(l => today >= l.start && today <= l.end))?.no === life.no)
  // 从上一辈子延续过来的目标，在这一辈子里留一个影子。
  const carried = childrenOf(nodes, null).filter(n => n.kind !== 'event' && crossing(lives, n)?.no === life.no)
  const events = nodes.filter(n => n.kind === 'event' && n.doneAt && lifeOf(lives, n.doneAt)?.no === life.no).sort((a, b) => a.doneAt.localeCompare(b.doneAt))
  const doneInLife = nodes.filter(n => n.kind !== 'event' && n.status === 'done' && n.doneAt && lifeOf(lives, n.doneAt)?.no === life.no).sort((a, b) => a.doneAt.localeCompare(b.doneAt))
  if (life.future && !carried.length) return ''
  const age = profile.birthday ? [Math.max(0, ageOn(profile.birthday, life.start)), ageOn(profile.birthday, life.end)] : null
  return html`<section class="life ${current ? 'is-current' : ''} ${life.future ? 'is-future' : ''}">
    <header class="life-head">
      <span class="life-knot"></span>
      <div>
        <h2 class="life-title">${life.name}${current ? html`<span class="tag tag-now">此生</span>` : ''}</h2>
        <p class="life-meta">${formatDot(life.start)} – ${formatDot(life.end)}${age ? ` · ${age[0]}–${age[1]} 岁` : ''}${life.theme ? ` · ${life.theme}` : ''}</p>
        ${life.creed ? html`<p class="life-creed">${life.creed}</p>` : ''}
      </div>
    </header>
    <div class="life-body">
      ${carried.map(g => html`<p class="carried">↳ 延续自上一辈子：<button class="link" data-action="node-edit" data-id="${g.id}">${g.title}</button>（目标 ${formatDot(g.due)}）</p>`)}
      ${goals.map(g => goalCard(nodes, g, lives))}
      ${events.length || doneInLife.length
        ? html`<div class="chronicle"><h3 class="chronicle-title">纪事</h3><ol>${[...events, ...doneInLife]
            .sort((a, b) => a.doneAt.localeCompare(b.doneAt))
            .map(n => html`<li><span class="chronicle-date">${formatDot(n.doneAt)}</span><button class="link" data-action="node-edit" data-id="${n.id}">${n.kind === 'event' ? n.title : `达成：${n.title}`}</button>${n.kind !== 'event' && n.parent ? html`<span class="muted small"> · ${rootOf(nodes, n).title}</span>` : ''}</li>`)}</ol></div>`
        : ''}
      ${!goals.length && !events.length && !doneInLife.length && !life.future ? html`<p class="muted">这一辈子还没有记录。</p>` : ''}
    </div>
  </section>`
}

function nodeSheet(ctx, node, parentId = null) {
  const nodes = ctx.state.goals
  const parent = parentId ? nodes.find(n => n.id === parentId) : null
  const kind = node?.kind || (parent ? NODE_KINDS[parent.kind].child : 'goal')
  const isEvent = kind === 'event'
  const n = node || { kind, status: isEvent ? 'done' : 'todo' }
  const kindChoices = parent || (node && node.parent) ? [] : [{ id: 'goal', name: '目标' }, { id: 'event', name: '纪事（已经发生的人生节点）' }]
  ctx.openSheet(html`<form data-form="node" class="sheet-form">
    ${sheetHead(node ? `编辑${NODE_KINDS[kind].name}` : parent ? `在「${parent.title}」下添加` : '新的目标或纪事')}
    <input type="hidden" name="id" value="${node?.id || ''}"><input type="hidden" name="parent" value="${node ? node.parent || '' : parentId || ''}">
    ${kindChoices.length && !node ? field('类型', html`<select name="kind" class="input" data-change="node-kind">${options(kindChoices, kind)}</select>`) : html`<input type="hidden" name="kind" value="${kind}">`}
    ${field('标题', html`<input name="title" class="input" maxlength="60" autocomplete="off" value="${n.title || ''}" required autofocus>`)}
    <div class="field-row node-fields-plan">
      ${field('状态', html`<select name="status" class="input">${options(STATUSES, n.status)}</select>`)}
      ${field('开始', html`<input name="start" type="date" class="input" value="${n.start || ''}">`)}
      ${field('目标日期', html`<input name="due" type="date" class="input" value="${n.due || ''}">`)}
    </div>
    ${field('达成 / 发生日期', html`<input name="doneAt" type="date" class="input" value="${n.doneAt || ''}">`, '状态改为“已达成”时默认今天')}
    ${field('备注', html`<textarea name="note" class="input" rows="2" maxlength="200">${n.note || ''}</textarea>`)}
    ${sheetActions('保存', node ? html`<button type="button" class="btn quiet danger" data-action="node-delete" data-id="${node.id}">删除</button>` : '')}
  </form>`)
}

export default {
  render(ctx) {
    const { state, today } = ctx
    const lives = withFuture(state.lives, 1)
    const nodes = state.goals
    return html`
      ${pageHead('里程碑', '连续的一生，分开的几辈子', html`<button class="btn primary" data-action="node-new">${icon('plus')}目标或纪事</button>`)}
      <section class="card ribbon-card no-swipe">${ribbon(lives, nodes, today, state.profile)}</section>
      <div class="lives">${[...lives].reverse().map(life => lifeSection(life, nodes, lives, today, state.profile))}</div>
      <p class="muted small center">每七年一辈子。新的一辈子开始时，在设置里写下它的开始日期与主题。</p>`
  },
  actions: {
    'node-new': ({ ctx, value }) => nodeSheet(ctx, null, value || null),
    'node-edit': ({ ctx, id }) => nodeSheet(ctx, ctx.state.goals.find(n => n.id === id)),
    'cycle-status': ({ ctx, id }) => {
      const current = ctx.state.goals.find(n => n.id === id)
      justDone = NEXT_STATUS[current.status] === 'done' ? id : null
      ctx.update(s => {
        const node = s.goals.find(n => n.id === id)
        node.status = NEXT_STATUS[node.status] || 'doing'
        if (node.status === 'done' && !node.doneAt) node.doneAt = ctx.today
        if (node.status !== 'done' && node.kind !== 'event') delete node.doneAt
      })
      justDone = null
      const node = ctx.state.goals.find(n => n.id === id)
      ctx.toast(node.status === 'done' ? `达成：${node.title}` : `「${node.title}」→ ${statusName(node.status)}`)
    },
    'node-delete': ({ ctx, id }) => {
      const ids = new Set([id])
      let grew = true
      while (grew) {
        grew = false
        for (const n of ctx.state.goals) if (n.parent && ids.has(n.parent) && !ids.has(n.id)) ids.add(n.id), (grew = true)
      }
      ctx.closeSheet()
      ctx.undoable(ids.size > 1 ? `已删除，连同 ${ids.size - 1} 个子项` : '已删除', s => {
        s.goals = s.goals.filter(n => !ids.has(n.id))
      })
    }
  },
  changes: {
    'node-kind': ({ el }) => {
      const form = el.closest('form')
      if (el.value === 'event') {
        form.elements.status.value = 'done'
        if (!form.elements.doneAt.value) form.elements.doneAt.value = todayKey()
      }
    }
  },
  forms: {
    node: ({ data, ctx }) => {
      const title = data.title.trim()
      if (!title) return ctx.toast('写个标题')
      const date = v => (isValidKey(v) ? v : '')
      const next = {
        title,
        kind: data.kind,
        status: data.kind === 'event' ? 'done' : data.status,
        start: date(data.start),
        due: date(data.due),
        doneAt: date(data.doneAt),
        note: data.note.trim()
      }
      if (next.status === 'done' && !next.doneAt) next.doneAt = ctx.today
      if (next.kind === 'event' && !next.doneAt) return ctx.toast('纪事需要一个日期')
      ctx.update(s => {
        const i = s.goals.findIndex(n => n.id === data.id)
        if (i >= 0) s.goals[i] = { ...s.goals[i], ...next }
        else {
          const siblings = s.goals.filter(n => (n.parent || '') === data.parent)
          s.goals.push({ id: uid(), parent: data.parent || null, order: siblings.length + 1, ...next })
        }
      })
      ctx.closeSheet()
    }
  }
}

