import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addYears, diffDays, cnNumber, startOfWeek, duration, hours, parseDateInput } from '../src/core/dates.js'
import { parseAmount, yuan } from '../src/core/money.js'
import { normalizeLives, lifePosition, withFuture, lifeYears, ageOn, nextBirthday } from '../src/domain/life.js'
import { coursesFor, weekOf, locateNow, blocksToLog } from '../src/domain/schedule.js'
import { parseLog, parseLine, summarize, ribbon } from '../src/domain/timelog.js'
import { balances, worth, summarizeMonth, plansMonthly, groupByDay, transferKind, monthlyNeed, liquidity, stableNeed, nextStep, allocate, monthBudget, health, netWorthSeries, livingHints } from '../src/domain/ledger.js'
import { realmOf, pace, neededPerDay } from '../src/domain/skill.js'
import { nextNumber, itemCode, itemTitle, ranking, dailyPick, safeUrl, setKindNames, kindName } from '../src/domain/library.js'
import { createZip, readZip, crc32 } from '../src/core/zip.js'
import { buildArchive, safeName, isArchivePath } from '../src/domain/archive.js'
import { progress, crossing, academicYears, achievements } from '../src/domain/milestones.js'
import { createSeed, sealChar } from '../src/domain/seed.js'
import { sample } from './fixture.js'
import { migrate } from '../src/core/migrate.js'
import { balanceSheet } from '../src/domain/overview.js'

const seed = sample('2026-10-13')

test('日期工具：闰日加年、中文数字、周一', () => {
  assert.equal(addYears('2028-02-29', 1), '2029-02-28')
  assert.equal(diffDays('2026-10-01', '2026-10-13'), 12)
  assert.equal(cnNumber(2), '二')
  assert.equal(cnNumber(13), '十三')
  assert.equal(cnNumber(20), '二十')
  assert.equal(startOfWeek('2026-10-13'), '2026-10-12')
  assert.equal(duration(90), '1 小时 30 分')
  assert.equal(hours(90), '1.5')
  assert.equal(hours(120), '2')
})

test('跳转日期：自然输入', () => {
  const t = '2026-10-13'
  const cases = { '10.20': '2026-10-20', 1020: '2026-10-20', '10月20日': '2026-10-20', '2027-1-7': '2027-01-07', 20270107: '2027-01-07', '+7': '2026-10-20', '-1': '2026-10-12', '3天后': '2026-10-16', 明天: '2026-10-14', 周三: '2026-10-14', 下周一: '2026-10-19', 上周日: '2026-10-11', '15号': '2026-10-15' }
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseDateInput(input, t), expected, input)
  assert.equal(parseDateInput('2-30', t), null)
  assert.equal(parseDateInput('随便', t), null)
})

test('辈子：第二辈子从 2026-09-01 起七年，今天是第 43 天', () => {
  const lives = normalizeLives(seed.lives)
  assert.equal(lives[0].name, '第一辈子')
  assert.equal(lives[0].end, '2026-08-31')
  assert.equal(lives[1].end, '2033-08-31')
  assert.equal(lives[1].days, 2557)
  const pos = lifePosition(seed.lives, '2026-10-13')
  assert.equal(pos.life.no, 2)
  assert.equal(pos.day, 43)
  assert.equal(pos.year, 1)
  assert.equal(pos.yearDays, 365)
  assert.equal(lifePosition(seed.lives, '2027-09-01').year, 2)
  assert.equal(lifeYears(lives[1]).length, 7)
  const future = withFuture(seed.lives)
  assert.equal(future[2].start, '2033-09-01')
  assert.equal(future[2].future, true)
  assert.equal(ageOn('2006-04-18', '2026-10-13'), 20)
  assert.deepEqual(nextBirthday('2006-04-18', '2026-10-13'), { age: 21, date: '2027-04-18', days: 187 })
})

test('课程表：相邻相同课程合并，午休不合并', () => {
  const tuesday = coursesFor(seed.schedule, '2026-10-13')
  assert.equal(tuesday.status, 'ok')
  assert.deepEqual(
    tuesday.blocks.map(b => `${b.periodText} ${b.title} ${b.place}`),
    ['早读 朗读 一教106', '第1–2节 线性代数 一教106', '第3–4节 大学英语 图书馆3楼', '第5–6节 高等数学 一教303', '第7节 高等数学 一教304', '第8节 家教备课 一教304', '第9–10节 教学实践 地点待定']
  )
  assert.equal(tuesday.blocks[0].confirm, true)
  assert.equal(tuesday.blocks[6].tentative, true)
  const friday = coursesFor(seed.schedule, '2026-10-16')
  assert.equal(friday.blocks.find(b => b.title === '线性代数').periodText, '第5–7节')
  assert.deepEqual(tuesday.blocks[3].segments.map(s => s.label), ['第5节', '第6节'])
  assert.equal(coursesFor(seed.schedule, '2026-10-17').status, 'free')
})

test('课程表：周次、学期外、停课与调休', () => {
  assert.equal(weekOf(seed.schedule.semester, '2026-09-07'), 1)
  assert.equal(weekOf(seed.schedule.semester, '2026-10-13'), 6)
  assert.equal(coursesFor(seed.schedule, '2026-08-01').status, 'out')
  const schedule = { ...seed.schedule, overrides: [{ date: '2026-10-14', type: 'off', label: '运动会' }, { date: '2026-10-17', type: 'as', as: 1, label: '调休' }] }
  assert.equal(coursesFor(schedule, '2026-10-14').status, 'off')
  const saturday = coursesFor(schedule, '2026-10-17')
  assert.equal(saturday.shifted, true)
  assert.equal(saturday.blocks[1].title, '高等数学')
})

test('课程表：定位当前一段与转成日志草稿', () => {
  const { blocks } = coursesFor(seed.schedule, '2026-10-13')
  assert.deepEqual(locateNow(blocks, 8 * 60 + 30), { current: 1, next: 2 })
  assert.deepEqual(locateNow(blocks, 12 * 60), { current: -1, next: 3 })
  assert.match(blocksToLog(blocks), /^07:10-07:50 自学 朗读\n08:00-09:40 自学 线性代数/)
  assert.match(blocksToLog(blocks), /19:30-21:10 工作 教学实践$/)
})

test('时间日志：多种写法都能解析', () => {
  assert.deepEqual(parseLine('07:10-08:00 早读 普通话'), { start: 430, end: 480, minutes: 50, category: 'study', note: '普通话' })
  assert.equal(parseLine('0710-0800 自学').minutes, 50)
  assert.equal(parseLine('7:10~8:00 跑步').category, 'sport')
  const sleep = parseLine('23:30-07:00 睡眠')
  assert.equal(sleep.minutes, 450)
  assert.equal(parseLine('45m 短视频').category, 'shortvideo')
  assert.equal(parseLine('1.5h 练习').minutes, 90)
  assert.equal(parseLine('1h30m 读书').minutes, 90)
  assert.equal(parseLine('2小时刻意练习').category, 'practice')
  assert.equal(parseLine('19:00-20:00 给学生讲题 家教').category, 'work')
  assert.equal(parseLine('19:00-20:00 发呆').category, 'rest')
  assert.equal(parseLine('# 注释'), null)
  assert.equal(parseLine('25:00-26:00 x').error, '时间不合法')
  const { entries, errors } = parseLog('07:00-07:30 洗漱\n乱写的一行\n\n08:00-09:40 上课 数学分析')
  assert.equal(entries.length, 2)
  assert.deepEqual(errors.map(e => e.line), [2])
  const sum = summarize(entries)
  assert.equal(sum.total, 130)
  assert.equal(sum.byKind.invest, 100)
  assert.equal(sum.byKind.maintain, 30)
  assert.deepEqual(ribbon([sleep]), [{ from: 0, to: 420, category: 'sleep' }, { from: 1410, to: 1440, category: 'sleep' }])
})

test('金额：按分存储，格式化', () => {
  assert.equal(parseAmount('12.5'), 1250)
  assert.equal(parseAmount('¥1,200'), 120000)
  assert.equal(parseAmount('0'), null)
  assert.equal(parseAmount('-3'), null)
  assert.equal(parseAmount('1.234'), null)
  assert.equal(yuan(1250), '¥12.50')
  assert.equal(yuan(120000), '¥1,200')
  assert.equal(yuan(-500, { sign: true }), '−¥5')
})

test('账本：余额、转移、校准与月度结构', () => {
  const ledger = structuredClone(seed.ledger)
  ledger.accounts[0].opening = 50000
  ledger.entries = [
    { id: 1, date: '2026-10-01', type: 'income', amount: 150000, stream: 'parents-regular', account: 'wechat' },
    { id: 2, date: '2026-10-02', type: 'expense', amount: 1500, category: 'meal', account: 'wechat' },
    { id: 3, date: '2026-10-02', type: 'expense', amount: 1200, category: 'snack', account: 'wechat' },
    { id: 4, date: '2026-10-05', type: 'income', amount: 20000, stream: 'tutor', account: 'alipay' },
    { id: 5, date: '2026-10-06', type: 'transfer', amount: 10000, account: 'wechat', to: 'fund' },
    { id: 6, date: '2026-10-07', type: 'adjust', amount: 300, account: 'fund' }
  ]
  const bal = balances(ledger)
  assert.equal(bal.wechat, 50000 + 150000 - 1500 - 1200 - 10000)
  assert.equal(bal.fund, 10300)
  const w = worth(ledger)
  assert.equal(w.long, 10300)
  assert.equal(w.net, 50000 + 150000 - 2700 + 20000 + 300)
  assert.equal(w.liabilities, 0)
  const month = summarizeMonth(ledger, '2026-10')
  assert.equal(month.income, 170000)
  assert.equal(month.expense, 2700)
  assert.equal(month.flows.long, 10000)
  assert.deepEqual(month.byGroup.map(g => g.id), ['parents', 'self'])
  assert.deepEqual(month.byLevel.map(g => g.id), [0, 1])
  ledger.plans = [{ amount: 10000, freq: 'monthly' }, { amount: 1200, freq: 'weekly' }]
  assert.equal(plansMonthly(ledger), 10000 + 5200)
  assert.equal(groupByDay(ledger.entries)[0].date, '2026-10-07')
})

test('四笔钱：活钱区间、负债与转移的含义', () => {
  const ledger = structuredClone(seed.ledger)
  ledger.accounts.find(a => a.id === 'wechat').opening = 80000
  ledger.accounts.find(a => a.id === 'reserve').opening = 300000
  ledger.accounts.push({ id: 'huabei', name: '花呗', kind: 'debt', opening: -20000 })
  ledger.entries = [
    { id: 1, date: '2026-09-10', type: 'expense', amount: 150000, category: 'meal', account: 'wechat' },
    { id: 2, date: '2026-10-02', type: 'expense', amount: 5000, category: 'snack', account: 'huabei' },
    { id: 3, date: '2026-10-05', type: 'transfer', amount: 25000, account: 'wechat', to: 'huabei' },
    { id: 4, date: '2026-10-06', type: 'transfer', amount: 10000, account: 'wechat', to: 'stable' }
  ]
  const w = worth(ledger)
  assert.equal(w.cash, 80000 + 300000 - 150000 - 25000 - 10000)
  assert.equal(w.stable, 10000)
  assert.equal(w.liabilities, 0)
  assert.equal(w.net, w.assets)
  assert.equal(transferKind(ledger, ledger.entries[2]).name, '还款')
  assert.equal(transferKind(ledger, ledger.entries[3]).name, '转入稳钱')
  assert.equal(transferKind(ledger, { account: 'huabei', to: 'wechat' }).name, '借入')
  assert.equal(transferKind(ledger, { account: 'stable', to: 'wechat' }).name, '稳钱取回活钱')
  const oct = summarizeMonth(ledger, '2026-10')
  assert.equal(oct.expense, 5000)
  assert.deepEqual([oct.flows.repay, oct.flows.stable], [25000, 10000])
  // 没填生活费时，按本月以前有支出的月份平均（只有九月）
  assert.deepEqual(monthlyNeed(ledger, '2026-10-13'), { amount: 150000, basis: 'history', months: 1 })
  ledger.living = { monthly: 100000, minMonths: 3, maxMonths: 6 }
  const liq = liquidity(ledger, '2026-10-13')
  assert.equal(liq.months, 1.95)
  assert.equal(liq.status, 'low')
  assert.equal(liq.gap, 105000)
  assert.equal(health(ledger, '2026-10-13').debtRatio, 0)
  assert.equal(netWorthSeries(ledger, '2026-10-13').map(x => x.month).join(), '2026-09,2026-10')
})

test('四笔钱：先活钱、再保险、再稳钱、最后长钱', () => {
  const ledger = structuredClone(seed.ledger)
  ledger.living = { monthly: 100000, minMonths: 3, maxMonths: 6 }
  ledger.accounts.find(a => a.id === 'reserve').opening = 195000
  assert.deepEqual(nextStep(ledger, '2026-10-13'), { bucket: 'cash', kind: 'fill', gap: 105000 })
  // 活钱不够下限时，这笔钱整笔留在活钱
  assert.deepEqual(allocate(ledger, '2026-10-13', 50000), { keep: 50000, stable: 0, long: 0 })
  ledger.accounts.find(a => a.id === 'reserve').opening = 500000
  assert.equal(nextStep(ledger, '2026-10-13').bucket, 'insurance')
  ledger.policies = [{ id: 'p1', name: '城乡居民医保', type: 'medical' }]
  assert.equal(nextStep(ledger, '2026-10-13').kind, 'steady')
  ledger.stableGoals = [{ id: 'g1', name: '电脑', amount: 40000, date: '2027-09-01' }]
  assert.deepEqual(stableNeed(ledger).gap, 40000)
  assert.equal(nextStep(ledger, '2026-10-13').bucket, 'stable')
  // 活钱 5000 元，下限 3000 元：拿出 1000 元分配，先补稳钱 400，剩下给长钱
  assert.deepEqual(allocate(ledger, '2026-10-13', 100000), { keep: 0, stable: 40000, long: 60000 })
  // 拿出 2500 元会让活钱跌破下限 500 元，这 500 元留在活钱
  assert.deepEqual(allocate(ledger, '2026-10-13', 250000), { keep: 50000, stable: 40000, long: 160000 })
  ledger.stableGoals = []
  ledger.accounts.find(a => a.id === 'reserve').opening = 800000
  assert.deepEqual(nextStep(ledger, '2026-10-13'), { bucket: 'long', kind: 'move', gap: 200000 })
})

test('四笔钱：不知道每月生活费时一分也不往下流；给出填多少的参考', () => {
  const ledger = structuredClone(seed.ledger)
  ledger.accounts.find(a => a.id === 'wechat').opening = 80000
  ledger.entries = [{ id: 'i', date: '2026-10-13', type: 'income', amount: 50000, account: 'wechat' }]
  assert.equal(nextStep(ledger, '2026-10-15').kind, 'setup')
  assert.deepEqual(allocate(ledger, '2026-10-15', 50000), { keep: 50000, stable: 0, long: 0 })
  assert.deepEqual(livingHints(ledger, '2026-10-15'), [])
  ledger.streams.find(s => s.id === 'parents-regular').monthly = 150000
  for (let d = 1; d <= 9; d++) ledger.entries.push({ id: `e${d}`, date: `2026-10-0${d}`, type: 'expense', amount: 4500, category: 'meal', account: 'wechat' })
  assert.deepEqual(livingHints(ledger, '2026-10-10'), [
    { amount: 150000, label: '按每月稳定收入' },
    { amount: 120000, label: '按最近 10 天的记账估算' }
  ])
})

test('本月可支配：收入先扣固定开销，已付的固定开销不重复扣', () => {
  const ledger = structuredClone(seed.ledger)
  ledger.streams.find(s => s.id === 'parents-regular').monthly = 150000
  ledger.fixed = [{ id: 'f1', name: '话费', amount: 5000, category: 'phone' }]
  ledger.entries = [
    { id: 1, date: '2026-10-05', type: 'income', amount: 20000, stream: 'tutor', account: 'wechat' },
    { id: 2, date: '2026-10-06', type: 'expense', amount: 5000, category: 'phone', account: 'wechat' },
    { id: 3, date: '2026-10-07', type: 'expense', amount: 3000, category: 'snack', account: 'wechat' }
  ]
  const b = monthBudget(ledger, '2026-10-13')
  assert.equal(b.pending, 150000)
  assert.equal(b.income, 170000)
  assert.equal(b.fixedUnpaid, 0)
  assert.equal(b.flexibleSpent, 3000)
  assert.equal(b.disposable, 165000)
  assert.equal(b.remaining, 162000)
  assert.equal(b.daysLeft, 19)
  ledger.entries.push({ id: 4, date: '2026-10-08', type: 'income', amount: 150000, stream: 'parents-regular', account: 'wechat' })
  assert.equal(monthBudget(ledger, '2026-10-13').income, 170000)
})

test('一万小时：境界与节奏', () => {
  assert.equal(realmOf(0).current.name, '初入门墙')
  assert.equal(realmOf(100 * 60).current.name, '初窥门径')
  assert.equal(realmOf(10000 * 60).next, null)
  const list = [{ date: '2026-10-12', minutes: 120 }, { date: '2026-10-13', minutes: 60 }]
  const p = pace(list, '2026-10-13', 30)
  assert.equal(p.total, 180)
  assert.equal(p.perDay, 6)
  assert.ok(p.eta > '2026-10-13')
  assert.equal(pace([], '2026-10-13').eta, null)
  assert.ok(neededPerDay(0, '2026-10-13', '2033-10-02') > 234)
})

test('图书馆：编号不复用，复利榜，今日一卷稳定', () => {
  const lib = structuredClone(seed.library)
  assert.equal(nextNumber(lib, 'fragment'), 3)
  lib.items = lib.items.filter(i => i.no !== 2)
  assert.equal(nextNumber(lib, 'fragment'), 3)
  assert.equal(nextNumber(lib, 'manual'), 1)
  assert.equal(itemCode({ kind: 'manual', no: 7 }), '秘籍 · 007')
  lib.uses = [{ itemId: 'c-001', date: '2026-10-13' }, { itemId: 'c-001', date: '2026-10-12' }]
  assert.equal(ranking(lib)[0].count, 2)
  assert.equal(dailyPick(seed.library.items, '2026-10-13'), dailyPick(seed.library.items, '2026-10-13'))
  assert.equal(nextNumber(lib, 'article'), 1)
  assert.equal(itemCode({ kind: 'article', no: 3 }), '心法 · 003')
  assert.equal(itemTitle({ kind: 'article', title: '论学习' }), '《论学习》')
  assert.equal(itemTitle({ kind: 'article', title: '《把时间当作朋友》读后' }), '《〈把时间当作朋友〉读后》')
  assert.equal(safeUrl('https://mp.weixin.qq.com/s/abc'), 'https://mp.weixin.qq.com/s/abc')
  assert.equal(safeUrl('javascript:alert(1)'), '')
  assert.equal(safeUrl('不是链接'), '')
  assert.equal(itemCode({ kind: 'song', no: 1 }), '琴谱 · 001')
  setKindNames({ song: '曲库' })
  assert.equal(itemCode({ kind: 'song', no: 1 }), '曲库 · 001')
  assert.equal(kindName('video'), '演武')
  setKindNames({})
})

test('里程碑：进度只数叶子，截止日跨辈子', () => {
  const p = progress(seed.goals, 'g-main')
  assert.equal(p.total, 8)
  assert.equal(p.done, 0)
  const lives = withFuture(seed.lives)
  assert.equal(crossing(lives, seed.goals[0]), null)
  const long = { start: '2032-01-01', due: '2035-01-01' }
  assert.equal(crossing(lives, long).no, 3)
  assert.equal(academicYears(2025)[1].label, '大二')
  assert.equal(academicYears(2025)[3].end, '2029-06-30')
  assert.equal(achievements(seed.goals)[0].id, 'e-start')
})

test('数据迁移：缺字段补默认，未知版本拒绝', () => {
  const partial = { version: 1, profile: { name: '林小舟' }, ledger: { entries: [{ id: 1 }] } }
  const fixed = migrate(partial, '2026-10-13')
  assert.equal(fixed.ledger.entries.length, 1)
  assert.equal(fixed.ledger.accounts.length, 7)
  assert.equal(fixed.version, 5)
  assert.equal(fixed.schedule.periods.length, 10)
  assert.equal(sealChar(fixed.profile), '小')
  assert.equal(sealChar({ name: '林小舟' }), '小')
  assert.equal(sealChar({}), '七')
  assert.equal(sealChar({ name: '林小舟', seal: '舟' }), '舟')
  assert.deepEqual(fixed.settings.show, { source: true, author: true, addedAt: true })
  assert.throws(() => migrate({ version: 99 }, '2026-10-13'))
  assert.throws(() => migrate('nope', '2026-10-13'))
})

test('数据迁移 v1 → v3：钱分四笔，原安全垫并入活钱，投资改为长钱', () => {
  const v1 = structuredClone(seed)
  v1.version = 1
  delete v1.ledger.openingDone
  delete v1.ledger.living
  v1.ledger.cushion = { targetMonths: 3, monthly: 120000 }
  v1.ledger.accounts = [
    { id: 'wechat', name: '微信', kind: 'cash', opening: 12000 },
    { id: 'bank', name: '银行卡', kind: 'saving', opening: 0 },
    { id: 'fund', name: '定投', kind: 'invest', opening: 0 }
  ]
  v1.ledger.categories = v1.ledger.categories.filter(c => c.id !== 'insurance')
  v1.library.next = { fragment: 3, manual: 1 }
  const v3 = migrate(v1, '2026-10-13')
  assert.equal(v3.version, 5)
  assert.deepEqual(v3.ledger.accounts.map(a => `${a.id}:${a.kind}`), ['wechat:cash', 'bank:cash', 'reserve:cash', 'stable:stable', 'fund:long'])
  assert.equal(v3.ledger.openingDone, true)
  assert.deepEqual(v3.ledger.living, { monthly: 120000, minMonths: 3, maxMonths: 6 })
  assert.equal(v3.ledger.cushion, undefined)
  assert.ok(v3.ledger.categories.some(c => c.id === 'insurance'))
  assert.deepEqual([v3.library.next.article, v3.library.next.video, v3.library.next.fragment], [1, 1, 3])
})

test('附件备份：zip 打包再读回，内容一致', async () => {
  assert.equal(await crc32(new Blob(['hello'])), 0x3610a686)
  const zip = await createZip([
    { name: 'data.json', data: '{"version":3}' },
    { name: 'files/abc', data: new Blob([new Uint8Array([1, 2, 3, 250])]) },
    { name: '中文名.txt', data: '楷' }
  ])
  const entries = await readZip(zip)
  assert.deepEqual(entries.map(e => e.name), ['data.json', 'files/abc', '中文名.txt'])
  assert.equal(await entries[0].blob.text(), '{"version":3}')
  assert.deepEqual([...new Uint8Array(await entries[1].blob.arrayBuffer())], [1, 2, 3, 250])
  assert.equal(await entries[2].blob.text(), '楷')
  await assert.rejects(readZip(new Blob(['not a zip'])))
})

test('附件备份：能读回被重新压缩（deflate）、外面多套一层文件夹的包', async () => {
  const { deflateRawSync } = await import('node:zlib')
  const name = Buffer.from('人生档案/data.json')
  const body = Buffer.from('{"version":3}')
  const packed = deflateRawSync(body)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
  local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length + packed.length, 16)
  const entries = await readZip(new Blob([local, name, packed, central, name, end]))
  assert.equal(entries[0].name, '人生档案/data.json')
  assert.equal(await entries[0].blob.text(), '{"version":3}')
})

test('人生档案：不依赖网站也能读，附件按编号命名并有索引', () => {
  const state = structuredClone(seed)
  state.ledger.entries = [{ id: 'e1', date: '2026-10-13', type: 'expense', amount: 1650, category: 'snack', account: 'wechat', note: '奶茶, 少糖' }]
  state.timelog['2026-10-13'] = { text: '07:10-07:50 早读 普通话' }
  state.gratitude['2026-10-13'] = ['室友帮我带了早餐', '', '']
  state.library.items.push({ id: 's1', kind: 'song', no: 1, title: '平凡之路', author: '朴树', addedAt: '2026-10-13', files: [{ id: 'f1', name: 'demo.mp3', type: 'audio/mpeg', size: 3 }, { id: 'f2', name: 'demo.mp3', type: 'audio/mpeg', size: 3 }] })
  const { entries, attachments } = buildArchive(state, { today: '2026-10-13' })
  const file = path => entries.find(e => e.path === path)?.data
  assert.ok(file('说明.md').includes('林小舟'))
  assert.equal(JSON.parse(file('data.json')).version, 5)
  const ledgerCsv = file('账本/流水-2026.csv')
  assert.ok(ledgerCsv.startsWith('﻿日期,类型,金额'))
  assert.ok(ledgerCsv.includes('2026-10-13,支出,-16.50,零食,微信,,"奶茶, 少糖"'))
  assert.ok(file('时间日志/2026-10.md').includes('07:10-07:50 早读 普通话'))
  assert.ok(file('感恩/2026.md').includes('1. 室友帮我带了早餐'))
  assert.ok(file('图书馆/琴谱.md').includes('《平凡之路》'))
  assert.deepEqual(attachments.map(a => a.path), ['附件/琴谱/琴谱 · 001 demo.mp3', '附件/琴谱/琴谱 · 001 demo (2).mp3'])
  assert.deepEqual(JSON.parse(file('附件/索引.json')), { f1: attachments[0].path, f2: attachments[1].path })
  assert.equal(safeName('a/b:c*?.pdf'), 'a_b_c__.pdf')
})

test('人生档案：分类名取这份数据自己的设置；只清理档案自己生成的文件', () => {
  const state = structuredClone(seed)
  state.settings.kindNames = { fragment: '句子', song: '歌单' }
  state.library.items.push({ id: 's1', kind: 'song', no: 1, title: '平凡之路', addedAt: '2026-10-13', files: [{ id: 'f1', name: 'demo.mp3', type: 'audio/mpeg', size: 3 }] })
  const { entries, attachments } = buildArchive(state, { today: '2026-10-13' })
  const file = path => entries.find(e => e.path === path)?.data
  assert.equal(file('图书馆/残卷.md'), undefined)
  assert.ok(file('图书馆/句子.md').startsWith('# 句子\n\n## 句子 · 001'))
  assert.ok(file('图书馆/歌单.md').startsWith('# 歌单（歌曲）'))
  assert.deepEqual(attachments.map(a => a.path), ['附件/歌单/歌单 · 001 demo.mp3'])
  assert.ok(file('说明.md').includes('句子、心法、秘籍、演武、歌单'))
  assert.equal(kindName('fragment'), '残卷') // 页面当前的设置不受影响
  for (const path of ['data.json', '说明.md', '账本/流水-2026.csv', '图书馆/残卷.md', '感恩/2026.md', '附件/索引.json']) assert.equal(isArchivePath(path), true, path)
  for (const path of ['历史/2026-10-13.json', '附件/琴谱/琴谱 · 001 demo.mp3', 'README.md', 'desktop.ini', '图书馆/封面.png']) assert.equal(isArchivePath(path), false, path)
})

test('盘点：没记录的天不计入平均', () => {
  const state = structuredClone(seed)
  state.timelog['2026-10-12'] = { text: '00:00-07:00 睡眠\n30m 短视频\n18:00-19:00 跑步' }
  state.timelog['2026-10-13'] = { text: '00:30-07:30 睡眠' }
  state.gratitude['2026-10-13'] = ['阳光', '', '']
  const sheet = balanceSheet(state, '2026-10-07', '2026-10-13')
  assert.equal(sheet.loggedDays, 2)
  assert.equal(sheet.attention.shortvideo, 30)
  assert.equal(sheet.attention.clearDays, 1)
  assert.equal(sheet.body.sleepAvg, 420)
  assert.equal(sheet.body.sport, 60)
  assert.equal(sheet.accumulate.gratitudeDays, 1)
})
