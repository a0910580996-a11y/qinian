// 图书馆附件：原始文件存在本机 IndexedDB，条目里只记 { id, name, type, size }。
import { html } from '../core/html.js'
import * as store from '../core/store.js'
import { icon } from './icons.js'

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function fileKind(type = '', name = '') {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  return 'other'
}

// 详情里的附件：图片、音频、视频直接预览，其余可以打开或下载。
export function attachmentView(files = []) {
  if (!files.length) return ''
  return html`<div class="attachments">${files.map(f => {
    const kind = fileKind(f.type, f.name)
    return html`<div class="attachment">
      ${kind === 'image' ? html`<img class="attachment-media" data-file-src="${f.id}" alt="${f.name}">` : ''}
      ${kind === 'audio' ? html`<audio class="attachment-media" controls preload="metadata" data-file-src="${f.id}"></audio>` : ''}
      ${kind === 'video' ? html`<video class="attachment-media" controls preload="metadata" playsinline data-file-src="${f.id}"></video>` : ''}
      <div class="attachment-row">
        ${icon('clip')}<span class="attachment-name">${f.name}</span><span class="muted small">${formatSize(f.size)}</span>
        <span class="grow"></span>
        ${kind === 'pdf' || kind === 'other' || kind === 'image' ? html`<a class="btn quiet sm" data-file-href="${f.id}" target="_blank" rel="noopener">打开</a>` : ''}
        <a class="btn quiet sm" data-file-href="${f.id}" download="${f.name}">下载</a>
      </div>
    </div>`
  })}</div>`
}

// 编辑表单里的附件：已有的可以取消勾选来移除，再选新文件追加。
export function attachmentField(files = []) {
  return html`<div class="field">
    <span class="field-label">附件 · 存在这台设备上，原文删了、书下架了也还在</span>
    ${files.length ? html`<div class="file-keep">${files.map(f => html`<label class="check"><input type="checkbox" name="keep" value="${f.id}" checked><span>${f.name} <span class="muted">${formatSize(f.size)}</span></span></label>`)}</div>` : ''}
    <input type="file" name="files" class="file-input" multiple>
    <span class="field-hint">PDF、电子书、网页存档、图片、音频、视频都可以。取消勾选就是移除。</span>
  </div>`
}

// 读取表单里的附件：保留勾选的旧附件，把新选的文件写进本机。
export async function collectAttachments(form, existing = []) {
  const keep = new Set([...form.querySelectorAll('input[name="keep"]:checked')].map(i => i.value))
  const kept = existing.filter(f => keep.has(f.id))
  const added = []
  for (const file of form.elements.files?.files || []) {
    const id = store.uid()
    await store.putFile(id, file)
    added.push({ id, name: file.name, type: file.type, size: file.size })
  }
  return [...kept, ...added]
}

const urls = new Set()
async function objectUrl(id) {
  const record = await store.getFile(id)
  if (!record) return null
  const url = URL.createObjectURL(record.blob)
  urls.add(url)
  return { url, record }
}

// 面板打开后再把文件挂上去：预览用 src，“打开 / 下载”用真正的链接，点击时不会被弹窗拦截。
// 同一个附件只生成一次地址；上一次面板的地址先释放，避免占着内存。
export async function hydrateFiles(root) {
  const targets = [...root.querySelectorAll('[data-file-src], [data-file-href]')]
  if (!targets.length) return
  for (const url of urls) URL.revokeObjectURL(url)
  urls.clear()
  const cache = new Map()
  for (const el of targets) {
    const id = el.dataset.fileSrc || el.dataset.fileHref
    if (!cache.has(id)) cache.set(id, await objectUrl(id))
    const found = cache.get(id)
    if (!found) {
      if (el.dataset.fileSrc) el.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: '这个附件不在这台设备上（可能是在另一台设备上添加的）。电脑上可以在「设置 → 数据与备份」从备份文件夹补回。' }))
      else el.remove()
    } else if (el.dataset.fileSrc) el.src = found.url
    else el.href = found.url
  }
}
