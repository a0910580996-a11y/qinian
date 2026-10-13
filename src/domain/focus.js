// 专注与签到：每一段课（相邻同课合并后）签到一次、签退一次。不点“开始”就算这段没上。
// 段里的每一节之间有课间：课间自动不计入有效时间，下一节开始自动接着计。
// 暂停只停“有效时间”，墙上的时间照走；下课时间一到自动签退。最后得到课堂里真正专注的时长。
// session：{ id, date, blockKey, title, periodText, plannedStart, plannedEnd, breaks: [{ from, to }], startedAt, endedAt, pauses: [{ from, to }], note }
// 时间一律用毫秒时间戳；plannedStart/End 为空表示“自由专注”，不受课表约束（可以有 target 预估分钟数）。
import { fromKey, clock } from '../core/dates.js'

export const blockKey = block => `b${block.start}`

// 某天某分钟对应的本地时间戳。
export function atMinute(dateKey, minutes) {
  const d = fromKey(dateKey)
  d.setMinutes(minutes)
  return d.getTime()
}

// 段内课间（毫秒区间）：第 i 节下课到第 i+1 节上课。
export function blockBreaks(block, dateKey) {
  const segs = block.segments || [{ start: block.start, end: block.end }]
  return segs.slice(1).map((seg, i) => ({ from: atMinute(dateKey, segs[i].end), to: atMinute(dateKey, seg.start) }))
}

export const plannedMinutes = block => (block.segments || [{ start: block.start, end: block.end }]).reduce((n, s) => n + s.end - s.start, 0)

export function sessionStatus(s) {
  if (s.endedAt) return 'ended'
  const last = s.pauses[s.pauses.length - 1]
  return last && !last.to ? 'paused' : 'running'
}

// 区间并集的总长度，只算落在 [lo, hi] 里的部分。
function covered(intervals, lo, hi) {
  const list = intervals.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  let total = 0
  let curA = null
  let curB = null
  for (const [a, b] of list) {
    if (curB === null || a > curB) {
      if (curB !== null) total += curB - curA
      curA = a
      curB = b
    } else curB = Math.max(curB, b)
  }
  if (curB !== null) total += curB - curA
  return total
}

// 有效时长（毫秒）：从开始到结束（或现在），去掉手动暂停和段内课间（两者重叠只算一次）。
export function effectiveMs(s, now = Date.now()) {
  const end = s.endedAt || now
  const excluded = [...s.pauses.map(p => [p.from, p.to || end]), ...(s.breaks || []).map(b => [b.from, b.to])]
  return Math.max(0, end - s.startedAt - covered(excluded, s.startedAt, end))
}

export const effectiveMinutes = (s, now) => Math.round(effectiveMs(s, now) / 60000)

// 此刻是不是在段内课间（签到着，但这会儿不计时）。
export const inBreak = (s, now = Date.now()) => !s.endedAt && (s.breaks || []).some(b => now >= b.from && now < b.to)

export function pause(s, now = Date.now()) {
  if (sessionStatus(s) === 'running') s.pauses.push({ from: now, to: null })
}

export function resume(s, now = Date.now()) {
  const last = s.pauses[s.pauses.length - 1]
  if (last && !last.to) last.to = now
}

export function finish(s, now = Date.now()) {
  if (s.endedAt) return
  resume(s, now)
  s.endedAt = now
}

// 到点自动签退：下课时间已过、还没结束的课堂专注，以下课时间为终点收尾。返回被收尾的那些。
export function settle(sessions, now = Date.now()) {
  const closed = []
  for (const s of sessions) {
    if (s.endedAt || !s.plannedEnd || now < s.plannedEnd) continue
    const end = Math.max(s.startedAt, s.plannedEnd)
    for (const p of s.pauses) if (!p.to) p.to = end
    s.endedAt = end
    closed.push(s)
  }
  return closed
}

// 此刻处在哪个阶段：
// class 正在上某一节；rest 课间（inner 段内两节之间 / short 段与段之间 / long 午休、傍晚这类长空档）；
// before 今天还没开始；done 今天都结束了。block 是当前或即将开始的那一段，segment 是当前或下一节。
export function phase(blocks, minutes) {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const segs = b.segments || [{ label: b.periodText, start: b.start, end: b.end }]
    for (let j = 0; j < segs.length; j++) {
      const seg = segs[j]
      if (minutes >= seg.start && minutes < seg.end) return { kind: 'class', block: b, segment: seg, index: j }
      if (j > 0 && minutes >= segs[j - 1].end && minutes < seg.start) return { kind: 'rest', scope: 'inner', block: b, segment: seg, index: j, until: seg.start }
    }
    const next = blocks[i + 1]
    if (next && minutes >= b.end && minutes < next.start) {
      const nextSeg = (next.segments || [next])[0]
      return { kind: 'rest', scope: next.start - b.end > 30 ? 'long' : 'short', block: next, segment: nextSeg, index: 0, until: next.start, after: b }
    }
  }
  if (blocks.length && minutes < blocks[0].start) return { kind: 'before', block: blocks[0], segment: (blocks[0].segments || [blocks[0]])[0], index: 0, until: blocks[0].start }
  return { kind: 'done', block: null, segment: null }
}

// 兼容旧接口：当前段或下一段。
export function focusContext(blocks, minutes) {
  const p = phase(blocks, minutes)
  if (p.kind === 'class' || (p.kind === 'rest' && p.scope === 'inner')) return { kind: 'current', block: p.block }
  if (p.kind === 'done') return { kind: 'done', block: null, next: null }
  return { kind: p.kind === 'before' ? 'before' : 'break', block: p.block, next: p.block }
}

export const sessionFor = (sessions, date, key) => [...sessions].reverse().find(s => s.date === date && s.blockKey === key) || null

// 出勤：已经开始或结束的段算“应到”，签过到的算“实到”；有效率 = 有效时长 ÷ 应到段的上课时长（不含课间）。
export function attendance(blocks, sessions, date, { minutes = Infinity, now = Date.now() } = {}) {
  const rows = blocks.map(b => {
    const s = sessionFor(sessions, date, blockKey(b))
    const due = b.start <= minutes
    return { block: b, session: s, due, planned: plannedMinutes(b), effective: s ? effectiveMinutes(s, now) : 0 }
  })
  const due = rows.filter(r => r.due)
  const attended = due.filter(r => r.session)
  const planned = due.reduce((n, r) => n + r.planned, 0)
  const effective = rows.reduce((n, r) => n + r.effective, 0)
  return {
    rows,
    total: rows.length,
    due: due.length,
    attended: attended.length,
    rate: due.length ? attended.length / due.length : null,
    planned,
    effective,
    efficiency: planned ? effective / planned : null
  }
}

// 签到记录 → 时间日志草稿：实际的开始结束时间，备注写“正在做什么”；
// 课间和超过 5 分钟的暂停把它断开成几行。
export function sessionsToLog(sessions, date, categoryOf = () => '自学') {
  const lines = []
  const minuteOf = t => {
    const d = new Date(t)
    return d.getHours() * 60 + d.getMinutes()
  }
  for (const s of sessions.filter(x => x.date === date && x.startedAt).sort((a, b) => a.startedAt - b.startedAt)) {
    const end = s.endedAt || Date.now()
    const gaps = [...s.pauses.filter(p => (p.to || end) - p.from >= 5 * 60000).map(p => ({ from: p.from, to: p.to || end })), ...(s.breaks || []).filter(b => b.to > s.startedAt && b.from < end)].sort((a, b) => a.from - b.from)
    const label = [categoryOf(s), s.title, s.note ? `· ${s.note}` : ''].filter(Boolean).join(' ')
    let from = s.startedAt
    for (const g of gaps) {
      if (g.from - from >= 60000) lines.push(`${clock(minuteOf(from))}-${clock(minuteOf(g.from))} ${label}`)
      from = Math.max(from, g.to)
    }
    if (end - from >= 60000) lines.push(`${clock(minuteOf(from))}-${clock(minuteOf(end))} ${label}`)
  }
  return lines.join('\n')
}

// 按时：签到不晚于开始后 5 分钟。
export const onTime = (s, block, date) => !!s && s.startedAt <= atMinute(date, block.start) + 5 * 60000

// 课间与空档的建议：走一走、晒太阳、打水、颈部操、远眺；长空档换成吃饭、午睡、散步。
export const REST_IDEAS = {
  short: [
    { title: '起来走一走', text: '去走廊尽头再走回来，让腿和眼睛都换个节奏。' },
    { title: '晒一晒太阳', text: '到窗边或楼外站两分钟，让光照到脸上。' },
    { title: '打一杯水', text: '顺路接满水杯，喝上几口。' },
    { title: '颈部操', text: '低头、仰头、左转、右转，各慢慢做五次；再耸肩十下。' },
    { title: '远眺', text: '看六米以外的地方二十秒，最好是树或天空。' },
    { title: '闭眼深呼吸', text: '吸气四拍，停四拍，呼气六拍，做五轮。' }
  ],
  long: [
    { title: '好好吃饭', text: '离开书桌吃饭，不边吃边刷手机。' },
    { title: '午睡二十分钟', text: '定个闹钟，二十分钟正好，再长会更困。' },
    { title: '散散步', text: '吃完走十分钟，消化，也清空一下脑子。' },
    { title: '整理一下', text: '把桌面和下午要用的书本准备好。' }
  ]
}
