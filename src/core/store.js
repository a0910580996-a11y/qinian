import { migrate } from './migrate.js'
import { createSeed } from '../domain/seed.js'

// 所有数据只存在这台设备的浏览器里：优先 IndexedDB（容量大），不可用时退回 localStorage。
// 不上传、不同步、不统计。换设备或清理浏览器前请导出备份。
// IndexedDB 里两个仓库：kv 存整份数据，files 存图书馆的附件（PDF、音视频等原始文件）。
const DB_NAME = 'qinian'
const DB_VERSION = 2
const KV = 'kv'
const FILES = 'files'
const KEY = 'state'
const LS_KEY = 'qinian:state'
const HISTORY_LIMIT = 50

let state = null
let db = null
let timer = null
const listeners = new Set()
const errorListeners = new Set()
// 撤销栈：每次记录在案的改动之前的快照，只存在本次打开的内存里。
const history = []

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(KV)) database.createObjectStore(KV)
      if (!database.objectStoreNames.contains(FILES)) database.createObjectStore(FILES)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx(mode, run, store = KV) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = run(transaction.objectStore(store))
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function load(today) {
  try {
    db = await openDB()
  } catch {
    db = null
  }
  let data = null
  if (db) {
    try {
      data = await tx('readonly', s => s.get(KEY))
    } catch {}
  }
  if (!data) {
    try {
      data = JSON.parse(localStorage.getItem(LS_KEY))
    } catch {}
  }
  // 已有数据却无法读取时直接报错，绝不用初始数据覆盖它。
  state = data ? migrate(data, today) : createSeed(today)
  if (!data) await save()
  return state
}

export const getState = () => state

// record：是否进入撤销栈。打字时的静默保存（render: false）默认不进。
export function update(mutate, { render = true, record = render } = {}) {
  if (record) {
    history.push({ before: structuredClone(state), at: Date.now() })
    if (history.length > HISTORY_LIMIT) history.shift()
  }
  mutate(state)
  state.updatedAt = new Date().toISOString()
  clearTimeout(timer)
  timer = setTimeout(save, 250)
  if (render) listeners.forEach(fn => fn())
}

export function undo() {
  const step = history.pop()
  if (!step) return false
  state = step.before
  save()
  listeners.forEach(fn => fn())
  return true
}

export const canUndo = () => history.length > 0
export const lastChangeAt = () => history[history.length - 1]?.at || 0

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function onError(fn) {
  errorListeners.add(fn)
}

export async function save() {
  clearTimeout(timer)
  if (!state) return
  if (db) {
    try {
      await tx('readwrite', s => s.put(state, KEY))
      return
    } catch {}
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch (error) {
    errorListeners.forEach(fn => fn(error))
  }
}

// 导入备份也进撤销栈：导错了可以退回去。
export function replaceWith(data, today) {
  const next = migrate(data, today)
  history.push({ before: structuredClone(state), at: Date.now() })
  state = next
  save()
  listeners.forEach(fn => fn())
}

// 同步把另一台设备的改动合并进来：清空撤销栈。
// 否则撤回到合并之前，下一次同步会把对方新增的内容当成“这台设备删掉了”。
export function applySynced(data) {
  state = data
  history.length = 0
  save()
  listeners.forEach(fn => fn())
}

export function exportJSON() {
  return JSON.stringify(state, null, 2)
}

// ---------- 附件 ----------
export const filesSupported = () => !!db

export async function putFile(id, file) {
  if (!db) throw new Error('这个浏览器不能保存附件（可能是无痕模式）。')
  await tx('readwrite', s => s.put({ blob: file, name: file.name, type: file.type, size: file.size }, id), FILES)
}

export async function getFile(id) {
  if (!db) return null
  return (await tx('readonly', s => s.get(id), FILES)) || null
}

export async function allFileIds() {
  if (!db) return []
  return (await tx('readonly', s => s.getAllKeys(), FILES)) || []
}

export function referencedFileIds(data = state) {
  return new Set((data.library?.items || []).flatMap(i => (i.files || []).map(f => f.id)))
}

// 启动时清理没有任何条目引用的附件（删除或撤销后留下的）。撤销栈不跨次打开，所以这时清理是安全的。
export async function collectGarbage() {
  if (!db) return 0
  const used = referencedFileIds()
  const orphans = (await allFileIds()).filter(id => !used.has(id))
  for (const id of orphans) await tx('readwrite', s => s.delete(id), FILES)
  return orphans.length
}

export async function storageEstimate() {
  try {
    return (await navigator.storage?.estimate?.()) || null
  } catch {
    return null
  }
}

// 请求浏览器把本站数据标记为“持久”，降低存储紧张时被自动清理的可能。
export async function requestPersist() {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) || false
  } catch {
    return false
  }
}

export const storageKind = () => (db ? 'IndexedDB' : 'localStorage')

// 其他需要留在本机、但不属于记录本身的东西（比如备份文件夹的授权句柄）。
export async function getLocal(key) {
  if (!db) return null
  try {
    return (await tx('readonly', s => s.get(`local:${key}`))) ?? null
  } catch {
    return null
  }
}

export async function setLocal(key, value) {
  if (!db) return
  await tx('readwrite', s => (value === null ? s.delete(`local:${key}`) : s.put(value, `local:${key}`)))
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
