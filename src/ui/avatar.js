// 头像：裁成正方形、缩到 256 像素、压成 JPEG，几十 KB，随资料一起同步和备份。没设头像时显示印章。
import { html } from '../core/html.js'
import { seal } from './icons.js'
import { sealChar } from '../domain/seed.js'

export const hasAvatar = profile => typeof profile?.avatar === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(profile.avatar)

export function avatar(profile, size = 40, cls = '') {
  if (hasAvatar(profile)) return html`<img class="avatar ${cls}" src="${profile.avatar}" width="${size}" height="${size}" alt="头像">`
  return html`<span class="avatar is-seal ${cls}">${seal(size, sealChar(profile))}</span>`
}

export async function makeAvatar(file, size = 256) {
  if (!file.type.startsWith('image/')) throw new Error('请选一张图片')
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('这张图片的格式浏览器打不开，换一张 JPG 或 PNG 试试')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close?.()
  return canvas.toDataURL('image/jpeg', 0.86)
}
