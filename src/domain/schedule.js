import { diffDays, toMinutes, weekday } from '../core/dates.js'

// 课程表按“每节独立成格”存储（slots[星期][节次]），显示时把相邻且内容相同的节次合并成一段。
export const TONES = [
  { id: 'blue', name: '蓝' },
  { id: 'violet', name: '紫' },
  { id: 'green', name: '绿' },
  { id: 'orange', name: '橙' },
  { id: 'apricot', name: '杏' },
  { id: 'amber', name: '金' },
  { id: 'gray', name: '灰' },
  { id: 'rose', name: '玫' }
]

// 两节之间间隔不超过这个分钟数才视为连续（课间 10 分钟、大课间 15 分钟）。
const MERGE_GAP = 20

export function weekOf(semester, key) {
  if (!semester?.start) return null
  const diff = diffDays(semester.start, key)
  if (diff < 0) return null
  const week = Math.floor(diff / 7) + 1
  return semester.weeks && week > semester.weeks ? null : week
}

export const isTentative = slot => !slot.place || /待定/.test(slot.place)

const sameContent = (a, b) =>
  a.title === b.title && (a.place || '') === (b.place || '') && a.tone === b.tone && (a.note || '') === (b.note || '') && !!a.confirm === !!b.confirm

export function mergeDay(periods, daySlots = {}, week = null) {
  const blocks = []
  for (const period of periods) {
    const slot = daySlots[period.id]
    if (!slot?.title?.trim()) continue
    if (week && Array.isArray(slot.weeks) && slot.weeks.length && !slot.weeks.includes(week)) continue
    const last = blocks[blocks.length - 1]
    const start = toMinutes(period.start)
    const end = toMinutes(period.end)
    if (last && sameContent(last.slot, slot) && start - last.end <= MERGE_GAP && last.lastIndex === periods.indexOf(period) - 1) {
      last.end = end
      last.periods.push(period.label)
      last.segments.push({ label: period.label, start, end })
      last.lastIndex++
      continue
    }
    blocks.push({ slot, start, end, periods: [period.label], segments: [{ label: period.label, start, end }], lastIndex: periods.indexOf(period) })
  }
  // segments：合并后每一节自己的时间，节与节之间就是课间。
  return blocks.map(({ slot, start, end, periods: labels, segments }) => ({
    title: slot.title.trim(),
    place: (slot.place || '').trim(),
    tone: slot.tone || 'gray',
    note: (slot.note || '').trim(),
    confirm: !!slot.confirm,
    tentative: isTentative(slot),
    start,
    end,
    periods: labels,
    segments,
    periodText: periodRange(labels)
  }))
}

// ['第1节','第2节'] → '第1–2节'；早读单独显示。
export function periodRange(labels) {
  if (labels.length === 1) return labels[0]
  const nums = labels.map(l => l.match(/\d+/)?.[0])
  if (nums.every(Boolean)) return `第${nums[0]}–${nums[nums.length - 1]}节`
  return `${labels[0]}–${labels[labels.length - 1]}`
}

export function coursesFor(schedule, key) {
  const override = (schedule.overrides || []).find(o => o.date === key)
  const week = weekOf(schedule.semester, key)
  if (override?.type === 'off') return { status: 'off', label: override.label || '停课', week, blocks: [] }
  if (schedule.semester?.start && week === null) return { status: 'out', week, blocks: [] }
  const day = override?.type === 'as' ? Number(override.as) : weekday(key)
  const blocks = mergeDay(schedule.periods, schedule.slots?.[day], week)
  return {
    status: blocks.length ? 'ok' : 'free',
    week,
    day,
    label: override?.type === 'as' ? override.label || '' : '',
    shifted: override?.type === 'as',
    blocks
  }
}

// 当前时刻与各段课程的关系：上一段/进行中/下一段。
export function locateNow(blocks, minutes) {
  const current = blocks.findIndex(b => minutes >= b.start && minutes < b.end)
  const next = blocks.findIndex(b => b.start > minutes)
  return { current, next }
}

// 课程表转成时间日志草稿：校课记作“上课”，家教相关记作“工作”，其余自学。
export function blocksToLog(blocks) {
  const pad = n => String(n).padStart(2, '0')
  const clock = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
  return blocks
    .map(b => {
      const category = b.tone === 'gray' ? '上课' : /家教|教学/.test(b.title) ? '工作' : '自学'
      return `${clock(b.start)}-${clock(b.end)} ${category} ${b.title}`
    })
    .join('\n')
}
