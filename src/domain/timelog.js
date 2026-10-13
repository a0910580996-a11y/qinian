// 时间日志：每晚手动敲一段文字，一行一件事，解析成结构化记录。
// 支持  07:10-08:00 自学 普通话   0710-0800 早读   23:30-07:00 睡眠   45m 短视频   1.5h 练习

// kind：时间的性质。投资让未来更好，维持让今天能运转，交换换来钱，自由是主动的放松，负债是失控的消耗。
export const TIME_KINDS = [
  { id: 'invest', name: '投资', hint: '学习、练习、阅读、运动' },
  { id: 'earn', name: '交换', hint: '用时间换钱' },
  { id: 'maintain', name: '维持', hint: '睡眠与生活' },
  { id: 'free', name: '自由', hint: '主动选择的放松与社交' },
  { id: 'debt', name: '负债', hint: '失控的消耗' }
]

export const TIME_CATEGORIES = [
  { id: 'class', name: '上课', kind: 'invest', aliases: ['课', '听课', '课堂'] },
  { id: 'study', name: '自学', kind: 'invest', aliases: ['学习', '自习', '复习', '预习', '刷题', '作业', '早读', '背单词', '网课'] },
  { id: 'practice', name: '练习', kind: 'invest', aliases: ['刻意练习', '修炼', '训练', '练'] },
  { id: 'read', name: '阅读', kind: 'invest', aliases: ['读书', '看书', '读'] },
  { id: 'sport', name: '运动', kind: 'invest', aliases: ['跑步', '健身', '锻炼', '体育', '乒乓球', '体操', '轮滑', '散步', '拉伸'] },
  { id: 'work', name: '工作', kind: 'earn', aliases: ['家教', '兼职', '备课', '上班', '打工', '教学'] },
  { id: 'sleep', name: '睡眠', kind: 'maintain', aliases: ['睡', '睡觉', '午睡', '补觉', '午休'] },
  { id: 'life', name: '生活', kind: 'maintain', aliases: ['吃饭', '早饭', '午饭', '晚饭', '通勤', '路上', '洗漱', '洗澡', '家务', '杂事', '购物', '收拾', '洗衣服'] },
  { id: 'social', name: '社交', kind: 'free', aliases: ['聊天', '聚会', '约饭', '电话', '陪家人'] },
  { id: 'rest', name: '休息', kind: 'free', aliases: ['娱乐', '游戏', '追剧', '看剧', '放松', '发呆', '电影', '音乐'] },
  { id: 'shortvideo', name: '短视频', kind: 'debt', aliases: ['刷视频', '抖音', '快手', '视频号', '刷手机', '小红书', 'b站', 'B站'] },
  { id: 'other', name: '其他', kind: 'maintain', aliases: [] }
]

const byId = Object.fromEntries(TIME_CATEGORIES.map(c => [c.id, c]))
export const categoryById = id => byId[id] || byId.other

// 别名按长度倒序匹配，避免“刻意练习”先被“练”截走。
const LOOKUP = TIME_CATEGORIES.flatMap(c => [c.name, ...c.aliases].map(word => ({ word: word.toLowerCase(), id: c.id }))).sort((a, b) => b.word.length - a.word.length)

// 先看第一个词是不是类别名或别名，其余作备注；否则在整句里找别名，整句作备注。
export function matchCategory(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return { id: 'other', rest: '' }
  const exact = LOOKUP.find(item => item.word === words[0].toLowerCase())
  if (exact) return { id: exact.id, rest: words.slice(1).join(' ') }
  const clean = text.toLowerCase()
  const contained = LOOKUP.find(item => item.word.length > 1 && clean.includes(item.word))
  return { id: contained ? contained.id : 'other', rest: words.join(' ') }
}

const RANGE = /^(\d{1,2})[:：.]?(\d{2})\s*(?:-|–|—|~|～|到|至)\s*(\d{1,2})[:：.]?(\d{2})\s*(.*)$/
const SPAN = /^(\d+(?:\.\d+)?)\s*(hr|h|个小时|小时|min|m|分钟|分)(?:\s*(\d+)\s*(?:min|m|分钟|分)?)?\s*(.*)$/i

function validClock(h, m) {
  return h >= 0 && h <= 24 && m >= 0 && m < 60 && !(h === 24 && m > 0)
}

export function parseLine(raw) {
  const line = raw.trim()
  if (!line || line.startsWith('#') || line.startsWith('//')) return null
  const range = line.match(RANGE)
  if (range) {
    const [, h1, m1, h2, m2, text] = range
    if (!validClock(+h1, +m1) || !validClock(+h2, +m2)) return { error: '时间不合法' }
    const start = +h1 * 60 + +m1
    const end = +h2 * 60 + +m2
    const minutes = end > start ? end - start : end + 1440 - start
    if (minutes <= 0 || start === end) return { error: '开始和结束相同' }
    const { id, rest } = matchCategory(text)
    return { start, end: end % 1440 === 0 && end > 0 ? 1440 : end, minutes, category: id, note: rest }
  }
  const span = line.match(SPAN)
  if (span) {
    const [, value, unit, extra, text] = span
    let minutes = /^(h|hr|小时|个小时)$/i.test(unit) ? Number(value) * 60 : Number(value)
    if (extra) minutes += Number(extra)
    minutes = Math.round(minutes)
    if (!minutes || minutes > 1440) return { error: '时长不合法' }
    const { id, rest } = matchCategory(text)
    return { start: null, end: null, minutes, category: id, note: rest }
  }
  return { error: '没认出时间' }
}

export function parseLog(text = '') {
  const entries = []
  const errors = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const result = parseLine(raw)
    if (!result) return
    if (result.error) errors.push({ line: index + 1, text: raw.trim(), reason: result.error })
    else entries.push({ ...result, line: index + 1 })
  })
  return { entries, errors }
}

export function summarize(entries) {
  const byCategory = {}
  const byKind = Object.fromEntries(TIME_KINDS.map(k => [k.id, 0]))
  let total = 0
  for (const entry of entries) {
    byCategory[entry.category] = (byCategory[entry.category] || 0) + entry.minutes
    byKind[categoryById(entry.category).kind] += entry.minutes
    total += entry.minutes
  }
  const categories = Object.entries(byCategory)
    .map(([id, minutes]) => ({ ...categoryById(id), minutes }))
    .sort((a, b) => b.minutes - a.minutes)
  return { total, categories, byKind }
}

// 一天 24 小时色带上的分段；跨午夜的记录拆成两段。
export function ribbon(entries) {
  const segments = []
  for (const entry of entries) {
    if (entry.start === null) continue
    if (entry.end > entry.start) segments.push({ from: entry.start, to: entry.end, category: entry.category })
    else {
      segments.push({ from: entry.start, to: 1440, category: entry.category })
      if (entry.end > 0) segments.push({ from: 0, to: entry.end, category: entry.category })
    }
  }
  return segments.sort((a, b) => a.from - b.from)
}

export function minutesOf(entries, categoryId) {
  return entries.filter(e => e.category === categoryId).reduce((sum, e) => sum + e.minutes, 0)
}
