// 人生图书馆收五种东西：
// 残卷 = 句子（听到、学到、击中内心的话），心法 = 文章，秘籍 = 书籍，演武 = 视频，琴谱 = 歌曲（曲库）。
// 名字可以在设置里改。编号按类别各自递增，删除后不复用，保证“残卷 · 007”永远指同一条。
export const KINDS = {
  fragment: { name: '残卷', noun: '句子', unit: '句' },
  article: { name: '心法', noun: '文章', unit: '篇' },
  manual: { name: '秘籍', noun: '书籍', unit: '本' },
  video: { name: '演武', noun: '视频', unit: '部' },
  song: { name: '琴谱', noun: '歌曲', unit: '首' }
}
export const KIND_ORDER = ['fragment', 'article', 'manual', 'video', 'song']

let customNames = {}
export function setKindNames(names) {
  customNames = names || {}
}
// names 不传时用页面当前的设置；生成档案时传入那份数据自己的设置，保证文件名和内容一致。
export const kindName = (kind, names = customNames) => names?.[kind]?.trim() || KINDS[kind].name

export const itemCode = (item, names) => `${kindName(item.kind, names)} · ${String(item.no).padStart(3, '0')}`
// 标题里本身带书名号时按嵌套规范改成单书名号：《〈把时间当作朋友〉读后》
export const itemTitle = item => (item.kind === 'fragment' ? item.text : `《${item.title.replace(/《/g, '〈').replace(/》/g, '〉')}》`)

// 只放行 http(s) 链接，其余（javascript: 等）一律丢弃。
export function safeUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

export function nextNumber(library, kind) {
  const used = library.items.filter(i => i.kind === kind).reduce((m, i) => Math.max(m, i.no), 0)
  return Math.max(library.next?.[kind] || 1, used + 1)
}

export function usesOf(library, itemId) {
  return library.uses.filter(u => u.itemId === itemId)
}

export function useCounts(library) {
  const counts = {}
  for (const u of library.uses) counts[u.itemId] = (counts[u.itemId] || 0) + 1
  return counts
}

export function usesByDay(uses) {
  const map = {}
  for (const u of uses) map[u.date] = (map[u.date] || 0) + 1
  return map
}

// 复利榜：被用上次数最多的条目。
export function ranking(library, limit = 5) {
  const counts = useCounts(library)
  return library.items
    .filter(i => counts[i.id])
    .map(i => ({ item: i, count: counts[i.id] }))
    .sort((a, b) => b.count - a.count || a.item.no - b.item.no)
    .slice(0, limit)
}

export function search(items, query) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(i => [i.text, i.title, i.source, i.author, i.note, itemCode(i), KINDS[i.kind].noun].some(v => v && String(v).toLowerCase().includes(q)))
}

// 按日期稳定地挑一条残卷作为“今日一卷”，同一天总是同一条。
export function dailyPick(items, key) {
  const pool = items.filter(i => i.kind === 'fragment')
  if (!pool.length) return null
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return pool[hash % pool.length]
}
