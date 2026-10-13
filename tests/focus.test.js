import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atMinute, blockKey, blockBreaks, plannedMinutes, sessionStatus, effectiveMinutes, inBreak, pause, resume, finish, settle, phase, attendance, sessionsToLog, onTime } from '../src/domain/focus.js'

const date = '2026-10-13'
const at = (h, m) => atMinute(date, h * 60 + m)
const seg = (label, h1, m1, h2, m2) => ({ label, start: h1 * 60 + m1, end: h2 * 60 + m2 })
const blocks = [
  { title: '线性代数', start: 14 * 60 + 30, end: 16 * 60 + 10, periodText: '第5–6节', segments: [seg('第5节', 14, 30, 15, 15), seg('第6节', 15, 25, 16, 10)] },
  { title: '线性代数', start: 16 * 60 + 20, end: 17 * 60 + 5, periodText: '第7节', segments: [seg('第7节', 16, 20, 17, 5)] },
  { title: '自习', start: 19 * 60 + 30, end: 20 * 60 + 15, periodText: '第9节', segments: [seg('第9节', 19, 30, 20, 15)] }
]
const session = (block, startedAt, extra = {}) => ({ id: `s${block.start}`, date, blockKey: blockKey(block), title: block.title, plannedStart: atMinute(date, block.start), plannedEnd: atMinute(date, block.end), breaks: blockBreaks(block, date), startedAt, endedAt: null, pauses: [], note: '', ...extra })

test('课间：段内两节之间自动不计入有效时间，与手动暂停重叠只算一次', () => {
  assert.deepEqual(blockBreaks(blocks[0], date), [{ from: at(15, 15), to: at(15, 25) }])
  assert.equal(plannedMinutes(blocks[0]), 90)
  const s = session(blocks[0], at(14, 29))
  assert.equal(inBreak(s, at(15, 20)), true)
  assert.equal(effectiveMinutes(s, at(15, 20)), 46) // 14:29–15:15
  pause(s, at(15, 10))
  assert.equal(sessionStatus(s), 'paused')
  resume(s, at(15, 22)) // 暂停 15:10–15:22 与课间 15:15–15:25 重叠
  finish(s, at(16, 10))
  assert.equal(effectiveMinutes(s), 101 - 15)
})

test('专注：下课自动签退，暂停中的也收尾到下课时间', () => {
  const a = session(blocks[0], at(14, 31))
  const b = session(blocks[1], at(16, 20), { pauses: [{ from: at(16, 50), to: null }] })
  const closed = settle([a, b], at(17, 30))
  assert.equal(closed.length, 2)
  assert.equal(a.endedAt, at(16, 10))
  assert.equal(effectiveMinutes(a), 99 - 10)
  assert.equal(effectiveMinutes(b), 30)
  const free = { id: 'f', date, blockKey: null, startedAt: at(20, 0), endedAt: null, pauses: [] }
  assert.equal(settle([free], at(23, 0)).length, 0)
})

test('阶段：上课、段内课间、段间课间、长空档、还没开始、都结束了', () => {
  assert.equal(phase(blocks, 14 * 60 + 29).kind, 'before')
  const p1 = phase(blocks, 14 * 60 + 40)
  assert.deepEqual([p1.kind, p1.segment.label], ['class', '第5节'])
  const p2 = phase(blocks, 15 * 60 + 18)
  assert.deepEqual([p2.kind, p2.scope, p2.segment.label, p2.until], ['rest', 'inner', '第6节', 15 * 60 + 25])
  const p3 = phase(blocks, 16 * 60 + 12)
  assert.deepEqual([p3.kind, p3.scope, p3.block.periodText], ['rest', 'short', '第7节'])
  const p4 = phase(blocks, 18 * 60)
  assert.deepEqual([p4.kind, p4.scope, p4.block.title], ['rest', 'long', '自习'])
  assert.equal(phase(blocks, 21 * 60).kind, 'done')
})

test('出勤：应到、实到、有效率按上课时长（不含课间）算', () => {
  const s1 = session(blocks[0], at(14, 29))
  finish(s1, at(16, 10))
  const a = attendance(blocks, [s1], date, { minutes: 17 * 60, now: at(17, 0) })
  assert.equal(a.due, 2)
  assert.equal(a.attended, 1)
  assert.equal(a.rate, 0.5)
  assert.equal(a.planned, 90 + 45)
  assert.equal(a.effective, 91)
  assert.equal(onTime(s1, blocks[0], date), true)
  assert.equal(onTime(session(blocks[1], at(16, 30)), blocks[1], date), false)
})

test('专注记录 → 时间日志草稿：课间和长暂停断开，备注写在做什么', () => {
  const s = session(blocks[0], at(14, 29), { note: '矩阵练习', pauses: [{ from: at(15, 40), to: at(15, 50) }, { from: at(16, 0), to: at(16, 2) }] })
  finish(s, at(16, 10))
  assert.equal(sessionsToLog([s], date), '14:29-15:15 自学 线性代数 · 矩阵练习\n15:25-15:40 自学 线性代数 · 矩阵练习\n15:50-16:10 自学 线性代数 · 矩阵练习')
})
