// 跨设备同步的三方合并：base 是上次同步时两边共同的版本，local 是这台设备现在的，remote 是云端现在的。
// 规则：只有一边改了，就用改了的那边；两边都改了，对象逐个字段合并、带 id 的列表逐条合并，
// 实在冲突（同一个值两边改得不一样）时以这台设备为准。删除也会同步：一边删了、另一边没动，就删掉。
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isRecordList = v => Array.isArray(v) && v.length > 0 && v.every(x => isObject(x) && typeof x.id === 'string')

export function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

// 某一方不存在（undefined）表示没有或被删掉了。
function mergeValue(base, local, remote) {
  if (deepEqual(local, remote)) return local
  if (deepEqual(base, local)) return remote
  if (deepEqual(base, remote)) return local
  if (isObject(local) && isObject(remote)) return mergeObject(isObject(base) ? base : {}, local, remote)
  const lists = [base, local, remote].filter(Array.isArray)
  if (Array.isArray(local) && Array.isArray(remote) && lists.every(l => l.length === 0 || isRecordList(l)) && (isRecordList(local) || isRecordList(remote)))
    return mergeRecords(Array.isArray(base) ? base : [], local, remote)
  return local === undefined ? remote : local
}

function mergeObject(base, local, remote) {
  const out = {}
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)])) {
    const value = mergeEntry(base[key], local[key], remote[key])
    if (value !== undefined) out[key] = value
  }
  return out
}

// 一条记录（或一个键）在三方里的去留。
function mergeEntry(b, l, r) {
  if (l !== undefined && r !== undefined) return mergeValue(b, l, r)
  if (l !== undefined) return b !== undefined && deepEqual(b, l) ? undefined : l // 云端删了且本机没改 → 删；本机改过或新加 → 留
  if (r !== undefined) return b !== undefined && deepEqual(b, r) ? undefined : r
  return undefined
}

function mergeRecords(base, local, remote) {
  const byId = list => new Map(list.map(x => [x.id, x]))
  const b = byId(base)
  const l = byId(local)
  const r = byId(remote)
  const order = [...local.map(x => x.id), ...remote.map(x => x.id).filter(id => !l.has(id))]
  const out = []
  for (const id of order) {
    const value = mergeEntry(b.get(id), l.get(id), r.get(id))
    if (value !== undefined) out.push(value)
  }
  return out
}

export function merge3(base, local, remote) {
  return mergeValue(base, local, remote)
}

// 只属于这台设备的设置不参与同步：主题、备份文件夹、上次备份时间。
export function toPayload(state) {
  const payload = structuredClone(state)
  delete payload.updatedAt
  if (payload.settings) {
    delete payload.settings.theme
    delete payload.settings.backup
    delete payload.settings.lastBackup
  }
  return payload
}

export function fromPayload(payload, local) {
  const state = structuredClone(payload)
  state.settings = { ...state.settings, theme: local.settings?.theme ?? 'auto', backup: local.settings?.backup, lastBackup: local.settings?.lastBackup ?? null }
  if (state.settings.backup === undefined) delete state.settings.backup
  state.updatedAt = new Date().toISOString()
  return state
}

// 两台设备离线时各自收录了“残卷 · 003”：保留上次同步时已有的那条，另一条改用下一个空号。
export function fixNumbering(state, base) {
  const known = new Set((base?.library?.items || []).map(i => i.id))
  const items = state.library?.items || []
  const renumbered = []
  for (const kind of new Set(items.map(i => i.kind))) {
    const list = items.filter(i => i.kind === kind)
    let max = list.reduce((m, i) => Math.max(m, i.no), 0)
    const seen = new Map()
    for (const item of [...list].sort((a, b) => Number(known.has(b.id)) - Number(known.has(a.id)) || a.id.localeCompare(b.id))) {
      if (seen.has(item.no)) {
        renumbered.push({ id: item.id, from: item.no, to: ++max })
        item.no = max
      }
      seen.set(item.no, item.id)
    }
    if (state.library.next) state.library.next[kind] = Math.max(state.library.next[kind] || 1, max + 1)
  }
  return renumbered
}

// 一台新设备、还没有任何自己的记录：第一次同步直接以云端为准。
export function isPristine(state) {
  return (
    !state.ledger.entries.length &&
    !state.ledger.openingDone &&
    !Object.keys(state.timelog).length &&
    !Object.keys(state.gratitude).length &&
    !state.practice.length &&
    !state.skills.length &&
    !state.library.uses.length &&
    state.library.items.every(i => i.id === 'c-001' || i.id === 'c-002')
  )
}

// 粗略数一下合并带来了多少处变化，用于提示。
export function countChanges(before, after) {
  const lists = s => [...(s.ledger?.entries || []), ...(s.practice || []), ...(s.library?.items || []), ...(s.library?.uses || []), ...(s.goals || [])]
  const a = new Map(lists(before).map(x => [x.id, x]))
  const b = new Map(lists(after).map(x => [x.id, x]))
  let n = 0
  for (const [id, x] of b) if (!a.has(id) || !deepEqual(a.get(id), x)) n++
  for (const id of a.keys()) if (!b.has(id)) n++
  for (const key of ['timelog', 'gratitude']) {
    const ka = before[key] || {}
    const kb = after[key] || {}
    for (const d of new Set([...Object.keys(ka), ...Object.keys(kb)])) if (!deepEqual(ka[d], kb[d])) n++
  }
  return n
}
