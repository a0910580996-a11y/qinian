import { lifeOf } from './life.js'

// 里程碑是一棵树：目标 → 子目标 → 项目。另有不挂在树上的“纪事”，记录已经发生的人生节点。
export const NODE_KINDS = {
  goal: { name: '目标', child: 'sub' },
  sub: { name: '子目标', child: 'project' },
  project: { name: '项目', child: 'project' },
  event: { name: '纪事', child: null }
}

export const STATUSES = [
  { id: 'todo', name: '未开始' },
  { id: 'doing', name: '进行中' },
  { id: 'done', name: '已达成' },
  { id: 'paused', name: '搁置' }
]

export const statusName = id => STATUSES.find(s => s.id === id)?.name || ''

export function childrenOf(nodes, parentId) {
  return nodes.filter(n => (n.parent || null) === parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
}

export function descendants(nodes, id) {
  const out = []
  for (const child of childrenOf(nodes, id)) out.push(child, ...descendants(nodes, child.id))
  return out
}

// 进度只数叶子节点，搁置的不计入分母。
export function progress(nodes, id) {
  const leaves = descendants(nodes, id).filter(n => !nodes.some(c => c.parent === n.id) && n.status !== 'paused')
  const done = leaves.filter(n => n.status === 'done').length
  return { done, total: leaves.length, ratio: leaves.length ? done / leaves.length : 0 }
}

// 节点归属：按开始日；没有开始日看达成日，再看截止日。
export function anchorDate(node) {
  return node.start || node.doneAt || node.due || null
}

export function rootOf(nodes, node) {
  let current = node
  while (current.parent) {
    const parent = nodes.find(n => n.id === current.parent)
    if (!parent) break
    current = parent
  }
  return current
}

export function lifeOfNode(lives, node, fallback) {
  const date = anchorDate(node)
  return (date && lifeOf(lives, date)) || fallback || null
}

// 截止日落在后一辈子：这件事跨越了辈子的分界。
export function crossing(lives, node) {
  const home = lifeOfNode(lives, node)
  if (!home || !node.due || node.due <= home.end) return null
  return lifeOf(lives, node.due) || null
}

export function achievements(nodes) {
  return nodes
    .filter(n => n.doneAt && (n.status === 'done' || n.kind === 'event'))
    .sort((a, b) => a.doneAt.localeCompare(b.doneAt))
}

// 入学年份 → 大一至大四的学年区间（9 月 1 日至次年 6 月 30 日）。
export function academicYears(enrollYear) {
  if (!enrollYear) return []
  return ['大一', '大二', '大三', '大四'].map((label, i) => ({
    label,
    start: `${enrollYear + i}-09-01`,
    end: `${enrollYear + i + 1}-06-30`
  }))
}
