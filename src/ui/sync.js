// 跨设备同步的调度：什么时候同步、怎么合并、怎么写回本机。
// 配置（仓库、令牌、设备名）和上次同步的共同版本只存在这台设备的 IndexedDB 里，不进备份、不进仓库。
import * as store from '../core/store.js'
import { createGitHub, SyncError } from '../core/github.js'
import { migrate } from '../core/migrate.js'
import { todayKey } from '../core/dates.js'
import { merge3, deepEqual, toPayload, fromPayload, fixNumbering, isPristine, countChanges } from '../domain/merge.js'
import { buildArchive } from '../domain/archive.js'

let status = { state: 'off', at: null, message: '' }
let running = null
let timer = null
const listeners = new Set()
const mergedListeners = new Set()
// 合并进来另一台设备的改动时通知界面（提示一句）。
export function onMerged(fn) {
  mergedListeners.add(fn)
}

export const getStatus = () => status
export function onStatus(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function setStatus(next) {
  status = { ...status, ...next }
  listeners.forEach(fn => fn(status))
}

export const getConfig = () => store.getLocal('sync')
export async function saveConfig(cfg) {
  await store.setLocal('sync', cfg)
}
export async function disconnect() {
  await store.setLocal('sync', null)
  await store.setLocal('syncBase', null)
  setStatus({ state: 'off', message: '', at: null })
}

export function defaultDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return '安卓手机'
  if (/Windows/.test(ua)) return 'Windows 电脑'
  if (/Mac/.test(ua)) return 'Mac'
  return '这台设备'
}

// 生成 GitHub 令牌的预填链接：名称、一年有效期、内容读写。仓库需要在页面里手动选“只选择这个数据仓库”。
export function tokenUrl(owner) {
  const params = { name: `人生中台同步 ${todayKey()}`, description: '七年 · 人生中台：同步记录到私有仓库', target_name: owner, expires_in: '365', contents: 'write' }
  return `https://github.com/settings/personal-access-tokens/new?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
}
export const newRepoUrl = name => `https://github.com/new?name=${encodeURIComponent(name)}&visibility=private&description=${encodeURIComponent('七年 · 人生中台的记录（私有）')}`

// 连接前检查：仓库必须是私有的，令牌要能写。
export async function verify(cfg) {
  const info = await createGitHub(cfg).check()
  if (!info.private) throw new SyncError('public', '这个仓库是公开的。记录里有账本和日记，请改成私有（Private）后再连接')
  if (!info.push) throw new SyncError('forbidden', '令牌只能读、不能写，请生成时把 Contents 设为 Read and write')
  return info
}

// 只把有变化的可读文件写进提交；data.json 永远是完整数据。
function changedFiles(before, after) {
  const prev = new Map(before ? buildArchive(before).entries.map(e => [e.path, e.data]) : [])
  return buildArchive(after).entries.filter(e => prev.get(e.path) !== e.data).map(e => ({ path: e.path, content: e.data }))
}

async function runSync({ choice } = {}) {
  const cfg = await getConfig()
  if (!cfg) return setStatus({ state: 'off' })
  setStatus({ state: 'syncing', message: '' })
  const gh = createGitHub(cfg)
  const branch = cfg.branch || 'main'
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await gh.pull(branch)
    const startState = store.getState()
    const start = structuredClone(startState)
    const local = toPayload(start)
    const base = await store.getLocal('syncBase')
    let remoteData = null
    if (remote.text) {
      try {
        remoteData = toPayload(migrate(JSON.parse(remote.text), todayKey()))
      } catch (error) {
        throw new SyncError('version', error.message.includes('更新的版本') ? '另一台设备用的是更新的网站版本，请先刷新这里' : '云端的数据读不出来')
      }
    }
    let merged
    if (!remoteData) merged = local
    else if (base?.data) merged = merge3(base.data, local, remoteData)
    else if (isPristine(start) || choice === 'remote') merged = remoteData
    else if (choice === 'merge') merged = merge3(undefined, local, remoteData)
    else {
      setStatus({ state: 'choice', message: '云端已经有记录，这台设备上也有，需要你决定怎么合并' })
      return { needsChoice: true }
    }
    fixNumbering(merged, base?.data || remoteData)
    let head = remote.head
    if (!remoteData || !deepEqual(merged, remoteData)) {
      // 云端现有的可读文件，就是按云端 data.json 生成的那一套：只推送和它不同的文件。
      const files = changedFiles(remoteData, merged)
      try {
        head = await gh.push(branch, remote.head, files, `同步：${cfg.device || '这台设备'} ${new Date().toLocaleString('zh-CN', { hour12: false })}`)
      } catch (error) {
        if (error.code === 'conflict' && attempt < 2) continue // 刚好有别的设备推了一版：重新拉取再合并
        throw error
      }
    }
    const at = new Date().toISOString()
    await store.setLocal('syncBase', { head, data: merged, at })
    // 同步期间又改了东西：以开始时为共同版本，再合并一次，新的改动留到下次推送。
    const current = store.getState()
    const finalPayload = current === startState && current.updatedAt === start.updatedAt ? merged : merge3(local, toPayload(current), merged)
    const changes = countChanges(toPayload(current), finalPayload)
    if (!deepEqual(toPayload(current), finalPayload)) store.applySynced(fromPayload(finalPayload, current))
    setStatus({ state: 'idle', at, message: '' })
    if (changes) mergedListeners.forEach(fn => fn(changes))
    return { changes }
  }
}

export function syncNow(options = {}) {
  if (running) return running
  running = runSync(options)
    .catch(error => {
      setStatus({ state: error.code === 'offline' ? 'offline' : 'error', message: error.message || '同步失败' })
      return { error }
    })
    .finally(() => {
      running = null
    })
  return running
}

// 自动同步：改动后 1 分钟、页面切走时、重新联网时，以及开着的时候每 5 分钟看一眼云端。
export async function startAutoSync() {
  const cfg = await getConfig()
  if (!cfg) return setStatus({ state: 'off' })
  setStatus({ state: 'idle', at: (await store.getLocal('syncBase'))?.at || null })
  syncNow()
  if (startAutoSync.started) return
  startAutoSync.started = true
  const soon = delay => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const c = await getConfig()
      if (c && c.auto !== false) syncNow()
    }, delay)
  }
  store.subscribe(() => soon(60 * 1000))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') soon(500)
    else soon(1000)
  })
  window.addEventListener('online', () => soon(1000))
  setInterval(() => {
    if (document.visibilityState === 'visible') soon(0)
  }, 5 * 60 * 1000)
}

export function statusText(s = status) {
  if (s.state === 'off') return ''
  if (s.state === 'syncing') return '同步中…'
  if (s.state === 'choice') return '等你决定怎么合并'
  if (s.state === 'offline') return '离线，联网后自动同步'
  if (s.state === 'error') return `同步出错：${s.message}`
  if (!s.at) return '已连接同步'
  const d = new Date(s.at)
  return `已同步 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
