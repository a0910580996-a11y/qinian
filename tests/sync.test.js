import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merge3, deepEqual, toPayload, fromPayload, fixNumbering, isPristine, countChanges } from '../src/domain/merge.js'
import { createGitHub, contentsUrl } from '../src/core/github.js'
import { createSeed } from '../src/domain/seed.js'
import { sample } from './fixture.js'

const seed = createSeed('2026-10-13')
const person = sample('2026-10-13')
const entry = (id, amount, extra = {}) => ({ id, date: '2026-10-13', type: 'expense', amount, category: 'meal', account: 'wechat', ...extra })

test('合并：两台设备各记各的账，都保留', () => {
  const base = { ledger: { entries: [entry('a', 100)] } }
  const local = { ledger: { entries: [entry('a', 100), entry('phone', 200)] } }
  const remote = { ledger: { entries: [entry('a', 100), entry('pc', 300)] } }
  assert.deepEqual(merge3(base, local, remote).ledger.entries.map(e => e.id), ['a', 'phone', 'pc'])
})

test('合并：一边删除、另一边没动 → 删掉；一边删除、另一边改过 → 保留改过的', () => {
  const base = { entries: [entry('a', 100), entry('b', 200)] }
  const local = { entries: [entry('b', 250)] } // 删了 a，改了 b
  const remote = { entries: [entry('a', 100)] } // 删了 b
  assert.deepEqual(merge3(base, local, remote).entries, [entry('b', 250)])
})

test('合并：同一条记录两边改了不同字段，逐字段合并；同一字段冲突以本机为准', () => {
  const base = { entries: [entry('a', 100, { note: '' })] }
  const local = { entries: [entry('a', 120, { note: '' })] }
  const remote = { entries: [entry('a', 100, { note: '午饭' })] }
  assert.deepEqual(merge3(base, local, remote).entries[0], entry('a', 120, { note: '午饭' }))
  const remote2 = { entries: [entry('a', 999, { note: '' })] }
  assert.equal(merge3(base, local, remote2).entries[0].amount, 120)
})

test('合并：按日期的时间日志与感恩逐天合并，删除的那天也同步', () => {
  const base = { timelog: { '2026-10-12': { text: 'x' }, '2026-10-11': { text: 'old' } } }
  const local = { timelog: { '2026-10-12': { text: 'x' }, '2026-10-13': { text: '手机上写的' } } }
  const remote = { timelog: { '2026-10-12': { text: 'x 改过' }, '2026-10-11': { text: 'old' } } }
  assert.deepEqual(merge3(base, local, remote).timelog, { '2026-10-12': { text: 'x 改过' }, '2026-10-13': { text: '手机上写的' } })
})

test('合并：没有共同版本（第一次）时取并集，相同内容不重复', () => {
  const local = { items: [{ id: 'c-001', text: '七年就是一辈子。' }, { id: 'x', text: '手机' }] }
  const remote = { items: [{ id: 'c-001', text: '七年就是一辈子。' }, { id: 'y', text: '电脑' }] }
  assert.deepEqual(merge3(undefined, local, remote).items.map(i => i.id), ['c-001', 'x', 'y'])
})

test('合并：空列表与记录列表、嵌套附件', () => {
  const base = { items: [] }
  const local = { items: [{ id: 'i1', files: [{ id: 'f1' }] }] }
  const remote = { items: [{ id: 'i2', files: [] }] }
  assert.deepEqual(merge3(base, local, remote).items.map(i => i.id), ['i1', 'i2'])
  const b2 = { items: [{ id: 'i1', files: [{ id: 'f1' }] }] }
  const l2 = { items: [{ id: 'i1', files: [{ id: 'f1' }, { id: 'f2' }] }] }
  const r2 = { items: [{ id: 'i1', files: [], note: '改了感想' }] }
  assert.deepEqual(merge3(b2, l2, r2).items[0], { id: 'i1', files: [{ id: 'f2' }], note: '改了感想' })
})

test('同步负载：主题、备份文件夹不跨设备', () => {
  const state = structuredClone(person)
  state.settings.theme = 'dark'
  state.settings.backup = { folder: '人生档案', auto: true }
  state.settings.lastBackup = '2026-10-13'
  state.updatedAt = 'x'
  const payload = toPayload(state)
  assert.equal(payload.settings.theme, undefined)
  assert.equal(payload.settings.backup, undefined)
  assert.equal(payload.updatedAt, undefined)
  const other = structuredClone(seed)
  other.settings.theme = 'light'
  const applied = fromPayload(payload, other)
  assert.equal(applied.settings.theme, 'light')
  assert.equal(applied.settings.backup, undefined)
  assert.equal(applied.profile.name, '林小舟')
})

test('编号：两台设备离线各收录了同号的残卷，后来者顺延', () => {
  const state = structuredClone(seed)
  const base = structuredClone(seed)
  state.library.items.push({ id: 'zz-phone', kind: 'fragment', no: 3, text: '手机' }, { id: 'aa-pc', kind: 'fragment', no: 3, text: '电脑' })
  const moved = fixNumbering(state, base)
  assert.equal(moved.length, 1)
  assert.deepEqual(state.library.items.filter(i => i.no >= 3).map(i => i.no).sort(), [3, 4])
  assert.equal(state.library.next.fragment, 5)
})

test('新设备判断与变化计数', () => {
  const fresh = structuredClone(seed)
  assert.equal(isPristine(fresh), true)
  const used = structuredClone(seed)
  used.ledger.entries.push(entry('a', 1))
  assert.equal(isPristine(used), false)
  assert.equal(countChanges(fresh, used), 1)
  assert.equal(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true)
})

// 用假的 fetch 模拟 GitHub，验证同步客户端的请求顺序与冲突处理。
function fakeGitHub() {
  const repo = { head: null, files: {}, commits: 0, private: true }
  const calls = []
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
  const fetcher = async (url, init = {}) => {
    const path = url.replace('https://api.github.com/repos/someone/data', '')
    const method = init.method || 'GET'
    calls.push(`${method} ${path.split('?')[0]}`)
    const body = init.body ? JSON.parse(init.body) : null
    if (path === '' && method === 'GET') return json(200, { private: repo.private, default_branch: 'main', permissions: { push: true } })
    if (path.startsWith('/git/ref/heads/main')) return repo.head ? json(200, { object: { sha: repo.head } }) : json(409, { message: 'Git Repository is empty.' })
    if (path.startsWith('/git/commits/') && method === 'GET') return json(200, { tree: { sha: `tree-${repo.head}` } })
    if (path.startsWith('/contents/data.json') && method === 'GET') return repo.files['data.json'] ? json(200, repo.files['data.json']) : json(404, {})
    if (path === '/contents/data.json' && method === 'PUT') {
      repo.files['data.json'] = Buffer.from(body.content, 'base64').toString('utf8')
      repo.head = `c${++repo.commits}`
      return json(201, { commit: { sha: repo.head } })
    }
    if (path === '/git/trees') {
      repo.pending = body.tree
      return json(201, { sha: 'tree-new' })
    }
    if (path === '/git/commits' && method === 'POST') return json(201, { sha: `c${repo.commits + 1}` })
    if (path === '/git/refs/heads/main' && method === 'PATCH') {
      if (repo.reject) {
        repo.reject = false
        return json(422, { message: 'Update is not a fast forward' })
      }
      for (const f of repo.pending) repo.files[f.path] = f.content
      repo.head = body.sha
      repo.commits++
      return json(200, {})
    }
    return json(500, { message: `unexpected ${method} ${path}` })
  }
  return { repo, calls, fetcher }
}

test('GitHub 客户端：空仓库先建 data.json，之后用提交追加可读文件；冲突时报告', async () => {
  const { repo, calls, fetcher } = fakeGitHub()
  const gh = createGitHub({ owner: 'someone', repo: 'data', token: 't' }, fetcher)
  const info = await gh.check()
  assert.equal(info.private, true)
  assert.deepEqual(await gh.pull('main'), { head: null, text: null })
  const head = await gh.push('main', null, [{ path: 'data.json', content: '{"v":1}' }, { path: '账本/流水-2026.csv', content: '日期' }], '第一次同步')
  assert.equal(repo.files['data.json'], '{"v":1}')
  assert.equal(repo.files['账本/流水-2026.csv'], '日期')
  assert.equal(head, repo.head)
  assert.deepEqual(await gh.pull('main'), { head: repo.head, text: '{"v":1}' })
  repo.reject = true
  await assert.rejects(gh.push('main', repo.head, [{ path: 'data.json', content: '{"v":2}' }], '冲突'), e => e.code === 'conflict')
  assert.ok(calls.includes('PUT /contents/data.json'))
  assert.equal(contentsUrl({ owner: 'a', repo: 'b' }, '账本/流水.csv'), 'https://api.github.com/repos/a/b/contents/%E8%B4%A6%E6%9C%AC/%E6%B5%81%E6%B0%B4.csv')
})
