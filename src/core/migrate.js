import { createSeed, SCHEMA_VERSION } from '../domain/seed.js'

const isObject = v => v && typeof v === 'object' && !Array.isArray(v)

// 用初始数据补齐缺失字段：只补“不存在”的键，已有的值（包括空数组）原样保留。
function fill(target, defaults, depth) {
  for (const [key, value] of Object.entries(defaults)) {
    if (target[key] === undefined) target[key] = structuredClone(value)
    else if (depth > 0 && isObject(target[key]) && isObject(value)) fill(target[key], value, depth - 1)
  }
  return target
}

// v2：“存款”改为“安全垫”（存下来备用的钱），加入负债与记账起点；图书馆加入文章。
function upgradeTo2(state) {
  const l = state.ledger
  const bank = l.accounts.find(a => a.id === 'bank' && a.name === '银行卡' && a.kind === 'saving')
  if (bank) bank.kind = 'cash'
  if (!l.accounts.some(a => a.kind === 'saving' || a.id === 'reserve')) {
    const at = l.accounts.findIndex(a => a.kind === 'invest')
    l.accounts.splice(at < 0 ? l.accounts.length : at, 0, { id: 'reserve', name: '备用金', kind: 'saving', opening: 0 })
  }
  l.openingDone = l.accounts.some(a => a.opening) || l.entries.some(e => e.type === 'adjust')
  state.library.next = { fragment: 1, article: 1, manual: 1, ...state.library.next }
}

// v3：钱分四笔——活钱、稳钱、长钱、保险。原“安全垫”并入活钱，原“投资”改为长钱；图书馆加入视频与歌曲。
function upgradeTo3(state) {
  const l = state.ledger
  for (const a of l.accounts) {
    if (a.kind === 'saving') a.kind = 'cash'
    if (a.kind === 'invest') a.kind = 'long'
  }
  if (!l.accounts.some(a => a.kind === 'stable' || a.id === 'stable')) {
    const at = l.accounts.findIndex(a => a.kind === 'long')
    l.accounts.splice(at < 0 ? l.accounts.length : at, 0, { id: 'stable', name: '稳钱', kind: 'stable', opening: 0 })
  }
  const months = l.cushion?.targetMonths || 3
  l.living = { monthly: l.cushion?.monthly || 0, minMonths: months, maxMonths: Math.max(6, months) }
  delete l.cushion
  if (!l.categories.some(c => c.id === 'insurance')) l.categories.splice(Math.max(0, l.categories.length - 1), 0, { id: 'insurance', name: '保险', hint: '保费' })
  state.library.next = { video: 1, song: 1, ...state.library.next }
}

export function migrate(data, today) {
  if (!isObject(data) || typeof data.version !== 'number') throw new Error('这不是人生中台的数据文件。')
  if (data.version > SCHEMA_VERSION) throw new Error('这份数据来自更新的版本，请先更新网站。')
  const state = structuredClone(data)
  // slots、timelog、gratitude 是用户的记录，只在整体缺失时补齐，不往里面掺初始内容。
  fill(state, createSeed(today), 1)
  fill(state.settings, { show: { source: true, author: true, addedAt: true } }, 1)
  if (data.version < 2) upgradeTo2(state)
  if (data.version < 3) upgradeTo3(state)
  // v4：新增课堂专注记录 sessions；v5：资料里新增 seal（印章上的字），都由上面的补齐步骤加上。
  state.version = SCHEMA_VERSION
  return state
}
