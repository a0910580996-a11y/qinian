// 备份：电脑上把完整档案写进一个本地文件夹（交给百度网盘客户端自动备份），手机上导出 zip 再分享到网盘 App。
import * as store from '../core/store.js'
import { createZip } from '../core/zip.js'
import { todayKey, diffDays } from '../core/dates.js'
import { buildArchive, isArchivePath } from '../domain/archive.js'

// 只有电脑上的 Chrome / Edge 能直接写本地文件夹。
export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export function canShareFiles() {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })
  } catch {
    return false
  }
}

export async function exportArchiveZip() {
  const archive = buildArchive(store.getState())
  const files = []
  let missing = 0
  for (const a of archive.attachments) {
    const record = await store.getFile(a.id)
    if (record) files.push({ name: a.path, data: record.blob })
    else missing++
  }
  const blob = await createZip([...archive.entries.map(e => ({ name: e.path, data: e.data })), ...files])
  return { blob, name: `人生档案-${todayKey()}.zip`, count: files.length, missing }
}

export async function connectFolder() {
  const handle = await window.showDirectoryPicker({ id: 'qinian-archive', mode: 'readwrite' })
  await store.setLocal('backupDir', handle)
  return handle
}

export const folderHandle = () => store.getLocal('backupDir')
export const forgetFolder = () => store.setLocal('backupDir', null)

export async function hasPermission(handle, ask = false) {
  const options = { mode: 'readwrite' }
  try {
    if ((await handle.queryPermission(options)) === 'granted') return true
    return ask ? (await handle.requestPermission(options)) === 'granted' : false
  } catch {
    return false
  }
}

async function writeFile(root, path, data, { skipSameSize = false } = {}) {
  const parts = path.split('/')
  const name = parts.pop()
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true })
  const handle = await dir.getFileHandle(name, { create: true })
  if (skipSameSize) {
    const size = data instanceof Blob ? data.size : new Blob([data]).size
    if ((await handle.getFile()).size === size) return false
  }
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
  return true
}

// 写入整份档案；附件已经在文件夹里（同名同大小）就跳过，所以第二次起很快。
// 另存一份当天的 data.json 到“历史/”，几十年后也能翻到任何一天的样子。
// 删掉文件夹里档案已经不再生成的旧文件（见 isArchivePath）；历史快照、附件原件和你自己放的文件不动。
async function removeStale(root, keep) {
  async function walk(dir, prefix) {
    const stale = []
    for await (const [name, child] of dir.entries()) {
      const path = prefix + name
      if (child.kind === 'directory') {
        if (path !== '历史' && path !== '附件') await walk(child, path + '/')
      } else if (isArchivePath(path) && !keep.has(path)) stale.push(name)
    }
    for (const name of stale) await dir.removeEntry(name).catch(() => {})
  }
  await walk(root, '')
}

export async function backupToFolder(handle, { attachments = true } = {}) {
  const state = store.getState()
  const today = todayKey()
  const archive = buildArchive(state, { today })
  for (const entry of archive.entries) await writeFile(handle, entry.path, entry.data)
  await removeStale(handle, new Set(archive.entries.map(e => e.path)))
  await writeFile(handle, `历史/${today}.json`, JSON.stringify(state))
  let written = 0
  let missing = 0
  if (attachments) {
    for (const a of archive.attachments) {
      const record = await store.getFile(a.id)
      if (!record) missing++
      else if (await writeFile(handle, a.path, record.blob, { skipSameSize: true })) written++
    }
  }
  store.update(
    s => {
      s.settings.lastBackup = today
    },
    { render: false, record: false }
  )
  return { written, missing, total: archive.attachments.length }
}

async function readPath(root, path) {
  const parts = path.split('/')
  const name = parts.pop()
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part)
  return (await dir.getFileHandle(name)).getFile()
}

export async function restoreAttachments(handle) {
  let index = {}
  try {
    index = JSON.parse(await (await readPath(handle, '附件/索引.json')).text())
  } catch {
    throw new Error('备份文件夹里还没有附件索引，先在有附件的设备上备份一次')
  }
  const metas = new Map(store.getState().library.items.flatMap(i => i.files || []).map(f => [f.id, f]))
  let restored = 0
  let missing = 0
  for (const [id, meta] of metas) {
    if (await store.getFile(id)) continue
    try {
      const file = await readPath(handle, index[id])
      await store.putFile(id, new File([file], meta.name, { type: meta.type || file.type }))
      restored++
    } catch {
      missing++
    }
  }
  return { restored, missing }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// 首页提醒：有记录以后，超过 7 天没备份（从没备份过则 3 天）就温和地提一句。
export function backupDue(state, today) {
  const hasData = state.ledger.entries.length || Object.keys(state.timelog).length || Object.keys(state.gratitude).length || state.practice.length || state.library.items.length > 2
  if (!hasData) return null
  const last = state.settings.lastBackup
  const since = last ? diffDays(last, today) : diffDays(state.createdAt, today)
  return since >= (last ? 7 : 3) ? { since, never: !last } : null
}

// 自动备份：只写数据（不含附件），在已授权的前提下、页面切走或关闭时进行。
let lastAuto = ''
export async function autoBackup() {
  const state = store.getState()
  if (!state?.settings.backup?.auto || !folderSupported() || state.updatedAt === lastAuto) return
  const handle = await folderHandle()
  if (!handle || !(await hasPermission(handle))) return
  lastAuto = state.updatedAt
  try {
    await backupToFolder(handle, { attachments: false })
  } catch {}
}

// 备份按钮的完整流程，设置页和首页共用。
export async function backupNow(ctx) {
  if (!folderSupported()) return ctx.go('#/settings')
  let handle = await folderHandle()
  if (!handle) {
    try {
      handle = await connectFolder()
    } catch {
      return
    }
    ctx.update(s => {
      s.settings.backup = { folder: handle.name, auto: true }
    }, { record: false })
  }
  if (!(await hasPermission(handle, true))) return ctx.toast('没有拿到文件夹的写入权限')
  ctx.toast('正在备份…')
  try {
    const r = await backupToFolder(handle)
    ctx.rerender()
    ctx.toast(`已备份到「${handle.name}」${r.written ? ` · 新写入 ${r.written} 个附件` : ''}${r.missing ? ` · ${r.missing} 个附件本机找不到` : ''}`)
  } catch (error) {
    ctx.toast('备份失败：' + (error.message || '文件夹不可写'))
  }
}
