// 测试用的虚构人物与课表：林小舟。结构与真实使用时一致（早读、连堂、待确认地点、调休），内容全是编的。
import { createSeed } from '../src/domain/seed.js'

const PERIODS = [
  { id: 'm', label: '早读', start: '07:10', end: '07:50' },
  { id: '1', label: '第1节', start: '08:00', end: '08:45' },
  { id: '2', label: '第2节', start: '08:55', end: '09:40' },
  { id: '3', label: '第3节', start: '10:00', end: '10:45' },
  { id: '4', label: '第4节', start: '10:55', end: '11:40' },
  { id: '5', label: '第5节', start: '14:30', end: '15:15' },
  { id: '6', label: '第6节', start: '15:25', end: '16:10' },
  { id: '7', label: '第7节', start: '16:20', end: '17:05' },
  { id: '8', label: '第8节', start: '17:15', end: '18:00' },
  { id: '9', label: '第9节', start: '19:30', end: '20:15' },
  { id: '10', label: '第10节', start: '20:25', end: '21:10' }
]

const TONES = { 线性代数: 'violet', 高等数学: 'green', 大学英语: 'blue', 家教备课: 'orange', 教学实践: 'apricot', 朗读: 'amber' }

// 每天依次为：早读、第1节 … 第10节。'*' 表示地点需确认。
const GRID = {
  1: ['朗读 一教101*', '高等数学 一教101', '高等数学 一教101', '大学英语 一教101', '大学英语 一教101', '大学英语 二教201', '大学英语 二教201', '线性代数 二教201', '线性代数 二教201', '线性代数 一教306', '线性代数 一教306'],
  2: ['朗读 一教106*', '线性代数 一教106', '线性代数 一教106', '大学英语 图书馆3楼', '大学英语 图书馆3楼', '高等数学 一教303', '高等数学 一教303', '高等数学 一教304', '家教备课 一教304', '教学实践 地点待定', '教学实践 地点待定'],
  5: ['朗读 地点待定', '大学英语 自习点待定', '大学英语 自习点待定', '体育·篮球 篮球场', '体育·篮球 篮球场', '线性代数 自习点待定', '线性代数 自习点待定', '线性代数 自习点待定', '家教备课 自习点待定', '教学实践 地点待定', '教学实践 地点待定']
}

function slots() {
  const out = {}
  for (const [day, cells] of Object.entries(GRID)) {
    out[day] = {}
    cells.forEach((cell, i) => {
      const [title, raw] = cell.split(' ')
      const slot = { title, place: raw.replace('*', ''), tone: TONES[title] || 'gray' }
      if (raw.endsWith('*')) Object.assign(slot, { confirm: true, note: '早读教室待确认' })
      out[day][PERIODS[i].id] = slot
    })
  }
  return out
}

export function sample(today = '2026-10-13') {
  const state = createSeed(today)
  state.profile = { name: '林小舟', en: 'Zhou', seal: '', birthday: '2006-04-18', school: '某某大学', major: '某某专业', enrollYear: 2025 }
  state.lives = [{ start: '2006-04-18', theme: '' }, { start: '2026-09-01', theme: '稳步前行', creed: '先做重要的事' }]
  state.schedule = { title: '测试课表', semester: { start: '2026-09-07', weeks: 20 }, periods: PERIODS, slots: slots(), overrides: [], notes: [] }
  state.goals = [
    { id: 'g-main', parent: null, kind: 'goal', title: '毕业时具备某种职业资格', status: 'doing', start: '2026-09-01', due: '2029-06-30', order: 1 },
    { id: 's-cert', parent: 'g-main', kind: 'sub', title: '证书', status: 'doing', order: 1 },
    { id: 'p-1', parent: 's-cert', kind: 'project', title: '证书一', status: 'doing', order: 1 },
    { id: 'p-2', parent: 's-cert', kind: 'project', title: '证书二', status: 'doing', order: 2 },
    { id: 'p-3', parent: 's-cert', kind: 'project', title: '资格证', status: 'doing', order: 3 },
    { id: 'p-3a', parent: 'p-3', kind: 'project', title: '笔试一', status: 'doing', order: 1 },
    { id: 'p-3b', parent: 'p-3', kind: 'project', title: '笔试二', status: 'todo', order: 2 },
    { id: 'p-3c', parent: 'p-3', kind: 'project', title: '笔试三', status: 'todo', order: 3 },
    { id: 'p-3d', parent: 'p-3', kind: 'project', title: '面试', status: 'todo', order: 4 },
    { id: 'p-4', parent: 's-cert', kind: 'project', title: '毕业证', status: 'doing', due: '2029-06-30', order: 4 },
    { id: 's-skill', parent: 'g-main', kind: 'sub', title: '能力', status: 'doing', order: 2 },
    { id: 'p-5', parent: 's-skill', kind: 'project', title: '实践', status: 'doing', order: 1 },
    { id: 'e-start', parent: null, kind: 'event', title: '入学', status: 'done', doneAt: '2025-09-01', order: 0 }
  ]
  state.library.items.push({ id: 'c-002', kind: 'fragment', no: 2, text: '先做重要的事。', source: '某本书', addedAt: today })
  state.library.next.fragment = 3
  return state
}
