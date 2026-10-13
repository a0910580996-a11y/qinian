import { html } from '../core/html.js'
import { formatDot, formatMonthDay, isValidKey, cnNumber } from '../core/dates.js'
import { uid } from '../core/store.js'
import { lifePosition, lifeYears, normalizeLives } from '../domain/life.js'
import { KINDS, KIND_ORDER, kindName, itemCode, itemTitle, nextNumber, useCounts, usesByDay, ranking, search, safeUrl } from '../domain/library.js'
import { icon } from '../ui/icons.js'
import { pageHead, segmented, empty, heatmap, field, sheetHead, sheetActions, stat } from '../ui/parts.js'
import { useSheet } from '../ui/shared.js'
import { attachmentView, attachmentField, collectAttachments, hydrateFiles } from '../ui/files.js'

let query = ''
let dayFilter = ''

// 路由里的分栏名 ↔ 条目类型
const TAB_KIND = { fragments: 'fragment', articles: 'article', manuals: 'manual', videos: 'video', songs: 'song' }
const KIND_TAB = Object.fromEntries(Object.entries(TAB_KIND).map(([tab, kind]) => [kind, tab]))
const EMPTY = {
  fragment: '听到、学到、击中内心的一句话，都可以收进来。',
  article: '读到值得反复看的文章，收进来；怕原文被删，就把 PDF 或网页存档一起放进来。',
  manual: '读过、在读、想反复读的书，放进你的人生图书馆。书没上架，也可以附上电子版。',
  video: '值得反复看的课、讲座、纪录片。可以只存链接，也可以把视频文件放进来。',
  song: '你认为好的歌。写下它为什么打动你，什么时候陪过你。'
}

// 每类条目的字段。text 是句子本身；title/author/source/url 视类别而定。
const FIELDS = {
  fragment: [
    { key: 'text', label: '那句话', type: 'textarea', required: '写下那句话' },
    { key: 'source', label: '来源', placeholder: '谁说的、在哪里看到的' }
  ],
  article: [
    { key: 'title', label: '文章标题', placeholder: '不用加书名号', required: '写下文章标题' },
    { key: 'author', label: '作者', half: true },
    { key: 'source', label: '出处', placeholder: '公众号、网站、期刊', half: true },
    { key: 'url', label: '链接（可不填）', type: 'url' }
  ],
  manual: [
    { key: 'title', label: '书名', placeholder: '不用加书名号', required: '写下书名' },
    { key: 'author', label: '作者' }
  ],
  video: [
    { key: 'title', label: '视频标题', required: '写下视频标题' },
    { key: 'author', label: 'UP 主 / 讲者', half: true },
    { key: 'source', label: '平台', placeholder: 'B 站、YouTube、公开课…', half: true },
    { key: 'url', label: '链接（可不填）', type: 'url' }
  ],
  song: [
    { key: 'title', label: '歌名', required: '写下歌名' },
    { key: 'author', label: '歌手', half: true },
    { key: 'url', label: '链接（可不填）', type: 'url', placeholder: '网易云、QQ 音乐…', half: true }
  ]
}

function route(ctx) {
  const [tab, year] = ctx.params
  return { tab: tab in TAB_KIND || tab === 'practice' ? tab : 'fragments', year: Number(year) || 0 }
}

function meta(item, show) {
  const parts = []
  if (item.kind === 'fragment' && show.source && item.source) parts.push(`—— ${item.source}`)
  if (item.kind !== 'fragment' && show.author) {
    if (item.author) parts.push(item.author)
    if (item.source) parts.push(item.source)
  }
  if (show.addedAt && item.addedAt) parts.push(`${formatDot(item.addedAt)} 入阁`)
  return parts.join('　')
}

const clipMark = item => (item.files?.length ? html`<span class="clip-mark" title="${item.files.length} 个附件">${icon('clip')}${item.files.length}</span>` : '')
const linkWord = item => (item.kind === 'song' ? '去听' : item.kind === 'video' ? '去看' : '原文')

function fragmentCard(item, count, show) {
  return html`<article class="frag">
    <header class="frag-head"><span class="code">${itemCode(item)}</span><span class="frag-marks">${clipMark(item)}${count ? html`<span class="uses" title="在生活中用上的次数">用上 ${count} 次</span>` : ''}</span></header>
    <button class="frag-text" data-action="item-open" data-id="${item.id}">${item.text}</button>
    <footer class="frag-foot">
      <span class="frag-meta">${meta(item, show)}</span>
      <button class="btn quiet sm" data-action="use-item" data-id="${item.id}">${icon('check')}用上了</button>
    </footer>
  </article>`
}

// 文章、书籍、视频、歌曲共用一行的样式；有链接时多一个“原文 / 去看 / 去听”。
function itemRow(item, count, show) {
  const m = meta(item, show)
  const url = safeUrl(item.url)
  return html`<li class="manual">
    <span class="code">${itemCode(item)}</span>
    <span class="manual-main"><button class="manual-title" data-action="item-open" data-id="${item.id}">${itemTitle(item)}</button>${m || url ? html`<span class="manual-meta">${m}${url ? html`${m ? '　' : ''}<a href="${url}" target="_blank" rel="noopener noreferrer">${linkWord(item)} ↗</a>` : ''}</span>` : ''}</span>
    <span class="frag-marks">${clipMark(item)}${count ? html`<span class="uses">用上 ${count} 次</span>` : ''}</span>
    <button class="btn quiet sm" data-action="use-item" data-id="${item.id}">${icon('check')}用上了</button>
  </li>`
}

function list(ctx, tab) {
  const { library, settings } = ctx.state
  const kind = TAB_KIND[tab]
  const all = library.items.filter(i => i.kind === kind).sort((a, b) => b.no - a.no)
  const items = search(all, query)
  const counts = useCounts(library)
  if (!all.length)
    return empty(
      `还没有${kindName(kind)}`,
      EMPTY[kind],
      html`<button class="btn primary" data-action="item-new" data-value="${kind}">${icon('plus')}收录第一${KINDS[kind].unit}</button>`
    )
  if (!items.length) return empty(`没有找到“${query}”`)
  return kind === 'fragment'
    ? html`<div class="frags">${items.map(i => fragmentCard(i, counts[i.id], settings.show))}</div>`
    : html`<ul class="manuals card">${items.map(i => itemRow(i, counts[i.id], settings.show))}</ul>`
}

function usesList(ctx) {
  const { library } = ctx.state
  const uses = [...library.uses].filter(u => !dayFilter || u.date === dayFilter).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40)
  if (!uses.length) return html`<p class="muted">${dayFilter ? '这一天没有实践记录。' : '还没有实践记录。下次某句话、某篇文章、某本书真的帮你解决了问题，记它一笔。'}</p>`
  return html`<ol class="use-list">${uses.map(u => {
    const item = library.items.find(i => i.id === u.itemId)
    return html`<li>
      <span class="use-date">${formatMonthDay(u.date)}</span>
      <div class="use-main">
        <button class="link" data-action="item-open" data-id="${u.itemId}">${item ? `${itemCode(item)}　${itemTitle(item)}` : '（已删除的条目）'}</button>
        ${u.note ? html`<p class="use-note">${u.note}</p>` : ''}
      </div>
      <button class="icon-btn sm" data-action="use-delete" data-id="${u.id}" aria-label="删除">${icon('close')}</button>
    </li>`
  })}</ol>${dayFilter ? html`<button class="btn quiet sm" data-action="heat-day" data-value="">显示全部</button>` : ''}`
}

function practice(ctx, yearParam) {
  const { state, today } = ctx
  const { library } = state
  const pos = lifePosition(state.lives, today)
  const life = pos?.life || normalizeLives(state.lives).at(-1)
  const years = lifeYears(life)
  const yearIndex = Math.min(years.length, Math.max(1, yearParam || pos?.year || 1))
  const year = years[yearIndex - 1]
  const touched = new Set(library.uses.map(u => u.itemId)).size
  const top = ranking(library, 5)
  return html`
    <section class="stats-row three">
      ${stat('实践', `${library.uses.length} 次`)}
      ${stat('被用上的条目', `${touched} / ${library.items.length}`)}
      ${stat(`第${cnNumber(yearIndex)}年`, `${library.uses.filter(u => u.date >= year.start && u.date <= year.end).length} 次`)}
    </section>
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">实践热力图</h2><span class="card-hint">第${cnNumber(yearIndex)}年</span>
        <span class="pager">
          <a class="icon-btn sm ${yearIndex <= 1 ? 'is-disabled' : ''}" href="#/library/practice/${yearIndex - 1}" aria-label="上一年">${icon('left')}</a>
          <a class="icon-btn sm ${yearIndex >= years.length ? 'is-disabled' : ''}" href="#/library/practice/${yearIndex + 1}" aria-label="下一年">${icon('right')}</a>
        </span>
        <p class="card-range">${formatDot(year.start)} – ${formatDot(year.end)} · 点格子查看当天</p>
      </div>
      ${heatmap({ from: year.start, to: year.end, today, values: usesByDay(library.uses), thresholds: [2, 3, 5], describe: v => (v ? `用上 ${v} 次` : '没有记录'), action: 'heat-day' })}
    </section>
    <div class="report-grid">
      <section class="card">
        <div class="card-head"><h2 class="card-title">复利榜</h2><span class="card-hint">被用上最多的</span></div>
        ${top.length ? html`<ol class="rank">${top.map((r, i) => html`<li><span class="rank-no">${i + 1}</span><button class="link rank-text" data-action="item-open" data-id="${r.item.id}"><span class="code">${itemCode(r.item)}</span>${itemTitle(r.item)}</button><span class="rank-count">${r.count}</span></li>`)}</ol>` : html`<p class="muted">还没有。</p>`}
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">${dayFilter ? formatMonthDay(dayFilter) + '的实践' : '实践记录'}</h2></div>
        <div data-region="uses">${usesList(ctx)}</div>
      </section>
    </div>`
}

function fieldControl(kind, f, item) {
  const name = `${kind}.${f.key}`
  const value = item?.kind === kind ? item[f.key] || '' : ''
  if (f.type === 'textarea') return html`<textarea name="${name}" class="input kai" rows="3" maxlength="500" placeholder="击中你的那句话">${value}</textarea>`
  return html`<input name="${name}" ${f.type === 'url' ? 'type="url"' : ''} class="input" maxlength="${f.type === 'url' ? 500 : 80}" autocomplete="off" value="${value}" placeholder="${f.placeholder || ''}">`
}

function itemSheet(ctx, item, kind = 'fragment') {
  const k = item?.kind || kind
  const radio = value => html`<label class="pick"><input type="radio" name="kind" value="${value}" ${k === value ? 'checked' : ''}><span>${KINDS[value].noun}</span></label>`
  ctx.openSheet(html`<form data-form="item" class="sheet-form item-form">
    ${sheetHead(item ? `编辑 ${itemCode(item)}` : '收录进图书馆')}
    <input type="hidden" name="id" value="${item?.id || ''}">
    ${item ? html`<input type="hidden" name="kind" value="${k}">` : html`<div class="pick-seg">${KIND_ORDER.map(radio)}</div>`}
    ${KIND_ORDER.map(kd => html`<div class="only-${kd}">
      <p class="kind-caption">${kindName(kd)} · ${KINDS[kd].noun}</p>
      ${FIELDS[kd].filter(f => !f.half).slice(0, 1).map(f => field(f.label, fieldControl(kd, f, item)))}
      ${FIELDS[kd].some(f => f.half) ? html`<div class="field-row">${FIELDS[kd].filter(f => f.half).map(f => field(f.label, fieldControl(kd, f, item)))}</div>` : ''}
      ${FIELDS[kd].filter(f => !f.half).slice(1).map(f => field(f.label, fieldControl(kd, f, item)))}
    </div>`)}
    ${field('感想（可不填）', html`<textarea name="note" class="input" rows="2" maxlength="500" placeholder="它为什么打动你">${item?.note || ''}</textarea>`)}
    ${attachmentField(item?.files || [])}
    ${field('入阁日期', html`<input name="addedAt" type="date" class="input" value="${item?.addedAt || ctx.today}">`)}
    ${sheetActions(item ? '保存' : '收录', item ? html`<button type="button" class="btn quiet danger" data-action="item-delete" data-id="${item.id}">删除</button>` : '')}
  </form>`)
}

function detailSheet(ctx, item) {
  const { library, settings } = ctx.state
  const uses = library.uses.filter(u => u.itemId === item.id).sort((a, b) => b.date.localeCompare(a.date))
  const m = meta(item, { source: true, author: true, addedAt: settings.show.addedAt })
  const url = safeUrl(item.url)
  ctx.openSheet(html`<div class="sheet-form">
    ${sheetHead(itemCode(item))}
    <blockquote class="use-quote ${item.kind === 'fragment' ? '' : 'manual'}">${itemTitle(item)}</blockquote>
    ${m ? html`<p class="muted">${m}</p>` : ''}
    ${url ? html`<p><a href="${url}" target="_blank" rel="noopener noreferrer">${item.kind === 'song' || item.kind === 'video' ? linkWord(item) : '打开原文'} ↗</a></p>` : ''}
    ${item.note ? html`<p class="detail-note">${item.note}</p>` : ''}
    ${attachmentView(item.files)}
    <h3 class="sheet-subtitle">用上的 ${uses.length} 次</h3>
    ${uses.length ? html`<ol class="use-list compact">${uses.map(u => html`<li><span class="use-date">${formatDot(u.date)}</span><div class="use-main">${u.note || html`<span class="muted">—</span>`}</div></li>`)}</ol>` : html`<p class="muted">还没有。</p>`}
    <div class="sheet-actions"><button type="button" class="btn quiet" data-action="item-edit" data-id="${item.id}">${icon('edit')}编辑</button><span class="grow"></span><button type="button" class="btn primary" data-action="use-item" data-id="${item.id}">${icon('check')}用上了</button></div>
  </div>`)
  hydrateFiles(document.getElementById('sheet'))
}

export default {
  render(ctx) {
    const { library, settings } = ctx.state
    const { tab, year } = route(ctx)
    const count = kind => library.items.filter(i => i.kind === kind).length
    const tabs = [...KIND_ORDER.map(kind => ({ id: KIND_TAB[kind], name: kindName(kind), count: count(kind) })), { id: 'practice', name: '实践', count: library.uses.length }]
    const toggle = (key, label) => html`<button class="chip toggle ${settings.show[key] ? 'is-on' : ''}" data-action="toggle-show" data-value="${key}" aria-pressed="${settings.show[key]}">${icon('eye')}${label}</button>`
    if (tab !== 'practice') dayFilter = ''
    const legend = KIND_ORDER.map(kind => `${kindName(kind)}是${KINDS[kind].noun}`).join('，')
    return html`
      ${pageHead('人生图书馆', `${legend} · 用上了，才算读过`, html`<button class="btn primary" data-action="item-new" data-value="${TAB_KIND[tab] || 'fragment'}">${icon('plus')}收录</button>`)}
      <div class="tabs-row lib-row">
        ${segmented(tabs, tab, 'lib-tab', '图书馆分类')}
        ${tab !== 'practice'
          ? html`<div class="lib-tools">
              <label class="search">${icon('search')}<input type="search" data-input="lib-search" value="${query}" placeholder="搜索" autocomplete="off"></label>
              ${tab === 'fragments' ? toggle('source', '来源') : toggle('author', tab === 'songs' ? '歌手' : '作者')}
              ${toggle('addedAt', '入阁时间')}
            </div>`
          : ''}
      </div>
      <div data-region="lib-list">${tab === 'practice' ? practice(ctx, year) : list(ctx, tab)}</div>`
  },
  actions: {
    'lib-tab': ({ ctx, value }) => ctx.go(value === 'fragments' ? '#/library' : `#/library/${value}`, { replace: true }),
    'toggle-show': ({ ctx, value }) =>
      ctx.update(
        s => {
          s.settings.show[value] = !s.settings.show[value]
        },
        { record: false }
      ),
    'item-new': ({ ctx, value }) => itemSheet(ctx, null, value || 'fragment'),
    'item-edit': ({ ctx, id }) => itemSheet(ctx, ctx.state.library.items.find(i => i.id === id)),
    'item-open': ({ ctx, id }) => {
      const item = ctx.state.library.items.find(i => i.id === id)
      if (item) detailSheet(ctx, item)
    },
    'item-delete': ({ ctx, id }) => {
      ctx.closeSheet()
      ctx.undoable('已从图书馆移除', s => {
        s.library.items = s.library.items.filter(i => i.id !== id)
        s.library.uses = s.library.uses.filter(u => u.itemId !== id)
      })
    },
    'use-delete': ({ ctx, id }) =>
      ctx.undoable('已删除这条实践记录', s => {
        s.library.uses = s.library.uses.filter(u => u.id !== id)
      }),
    'heat-day': ({ ctx, value }) => {
      dayFilter = dayFilter === value ? '' : value || ''
      ctx.rerender()
    },
    'use-item': ({ ctx, id }) => {
      const item = ctx.state.library.items.find(i => i.id === id)
      if (item) useSheet(ctx, item)
    }
  },
  inputs: {
    'lib-search': ({ ctx, value }) => {
      query = value
      ctx.patch('lib-list', list(ctx, route(ctx).tab))
    }
  },
  forms: {
    item: async ({ data, form, ctx }) => {
      const kind = data.kind in KIND_TAB ? data.kind : 'fragment'
      // 只去掉整体包住标题的一对书名号，“《某书》读后”这类标题保持原样。
      const clean = v => {
        const t = (v || '').trim()
        const m = t.match(/^《([^《》]+)》$/)
        return m ? m[1] : t
      }
      const fields = {}
      for (const f of FIELDS[kind]) {
        const raw = data[`${kind}.${f.key}`] || ''
        if (f.type === 'url') {
          if (raw.trim() && !safeUrl(raw)) return ctx.toast('链接要以 http:// 或 https:// 开头')
          fields[f.key] = safeUrl(raw)
        } else fields[f.key] = f.key === 'title' ? clean(raw) : raw.trim()
        if (f.required && !fields[f.key]) return ctx.toast(f.required)
      }
      const existing = ctx.state.library.items.find(x => x.id === data.id)
      let files
      try {
        files = await collectAttachments(form, existing?.files || [])
      } catch (error) {
        return ctx.toast(error.message || '附件没能保存')
      }
      const common = { note: data.note.trim(), addedAt: isValidKey(data.addedAt) ? data.addedAt : ctx.today, files }
      let code = ''
      ctx.update(s => {
        const lib = s.library
        const i = lib.items.findIndex(x => x.id === data.id)
        if (i >= 0) lib.items[i] = { ...lib.items[i], ...fields, ...common }
        else {
          const no = nextNumber(lib, kind)
          lib.next = { ...lib.next, [kind]: no + 1 }
          const item = { id: uid(), kind, no, ...fields, ...common }
          lib.items.push(item)
          code = itemCode(item)
        }
      })
      ctx.closeSheet()
      ctx.toast(code ? `收录为 ${code}` : '已保存')
      if (code && route(ctx).tab !== KIND_TAB[kind]) ctx.go(kind === 'fragment' ? '#/library' : `#/library/${KIND_TAB[kind]}`, { replace: true })
    }
  }
}
