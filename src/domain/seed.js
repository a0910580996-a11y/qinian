// 首次打开时的初始数据：一份空白的模板。名字、生日、课程表、目标都由使用者自己填，
// 或者从备份恢复、连接同步后从自己的私有仓库取回。代码里不放任何个人信息。
// 之后的一切修改都保存在浏览器本地，不会写回这里。
export const SCHEMA_VERSION = 5

// 常见的大学作息；在「设置 → 课程表」里可以改、可以加早读。
const PERIODS = [
  { id: '1', label: '第1节', start: '08:00', end: '08:45' },
  { id: '2', label: '第2节', start: '08:55', end: '09:40' },
  { id: '3', label: '第3节', start: '10:00', end: '10:45' },
  { id: '4', label: '第4节', start: '10:55', end: '11:40' },
  { id: '5', label: '第5节', start: '14:30', end: '15:15' },
  { id: '6', label: '第6节', start: '15:25', end: '16:10' },
  { id: '7', label: '第7节', start: '16:20', end: '17:05' },
  { id: '8', label: '第8节', start: '17:15', end: '18:00' },
  { id: '9', label: '第9节', start: '19:30', end: '20:15' },
  { id: '10', label: '第10节', start: '20:25', end: '21:10' }
]

export function createSeed(today) {
  return {
    version: SCHEMA_VERSION,
    createdAt: today,
    // en：昵称（问候与侧栏用）；signature：个人签名；avatar：头像（data URL）；seal：印章上的那个字，空着时取名字里的字或“七”。
    profile: { name: '', en: '', signature: '', avatar: '', seal: '', birthday: '', school: '', major: '', enrollYear: null },
    // 还没设置时，先把今天当作这一辈子的开始；首页的欢迎卡片会请你填真实的日期。
    lives: [{ start: today, theme: '' }],
    schedule: {
      title: '',
      semester: { start: '', weeks: 20 },
      periods: PERIODS,
      slots: {},
      overrides: [],
      notes: []
    },
    goals: [],
    skills: [],
    practice: [],
    // 课堂专注与签到记录，见 domain/focus.js
    sessions: [],
    ledger: {
      // 记账起点：openingDone 之前，账本会请你先设置各账户起点的金额；之后随时可以重新设置。
      openingDone: false,
      startDate: null,
      accounts: [
        { id: 'wechat', name: '微信', kind: 'cash', opening: 0 },
        { id: 'alipay', name: '支付宝', kind: 'cash', opening: 0 },
        { id: 'bank', name: '银行卡', kind: 'cash', opening: 0 },
        { id: 'cash', name: '现金', kind: 'cash', opening: 0 },
        { id: 'reserve', name: '备用金', kind: 'cash', opening: 0 },
        { id: 'stable', name: '稳钱', kind: 'stable', opening: 0 },
        { id: 'fund', name: '定投', kind: 'long', opening: 0 }
      ],
      // 活钱放够几个月的生活费；monthly 为 0 时按历史支出自动估算。
      living: { monthly: 0, minMonths: 3, maxMonths: 6 },
      stableGoals: [],
      policies: [],
      categories: [
        { id: 'meal', name: '吃饭' },
        { id: 'snack', name: '零食', hint: '奶茶、含糖饮料也算' },
        { id: 'phone', name: '话费' },
        { id: 'power', name: '电费' },
        { id: 'transport', name: '交通' },
        { id: 'study', name: '学习' },
        { id: 'daily', name: '日用' },
        { id: 'social', name: '社交' },
        { id: 'fun', name: '娱乐' },
        { id: 'health', name: '医疗' },
        { id: 'insurance', name: '保险', hint: '保费' },
        { id: 'clothes', name: '衣物' },
        { id: 'other', name: '其他' }
      ],
      streams: [
        { id: 'parents-regular', name: '父母 · 常规生活费', group: 'parents', level: 0, stability: 'stable', monthly: 0 },
        { id: 'parents-extra', name: '父母 · 额外生活费', group: 'parents', level: 0, stability: 'occasional', monthly: 0 },
        { id: 'tutor', name: '家教', group: 'self', level: 1, stability: 'fair', monthly: 0 },
        { id: 'self-other', name: '其他自己赚的', group: 'self', level: 1, stability: 'occasional', monthly: 0 }
      ],
      fixed: [],
      plans: [],
      entries: []
    },
    timelog: {},
    gratitude: {},
    library: {
      next: { fragment: 2, article: 1, manual: 1, video: 1, song: 1 },
      items: [{ id: 'c-001', kind: 'fragment', no: 1, text: '七年就是一辈子。', source: '李笑来', addedAt: today }],
      uses: []
    },
    settings: {
      theme: 'auto',
      show: { source: true, author: true, addedAt: true },
      kindNames: {},
      lastBackup: null
    }
  }
}

// 印章上的字：自己设过就用设的；否则取名字里的一个字（三个字取中间，两个字取后一个）；都没有就是“七”。
export function sealChar(profile = {}) {
  if (profile.seal?.trim()) return profile.seal.trim().slice(0, 1)
  const name = (profile.name || '').trim()
  if (name.length >= 3) return name[1]
  if (name.length) return name[name.length - 1]
  return '七'
}

export const displayName = profile => (profile?.en || profile?.name || '').trim()
