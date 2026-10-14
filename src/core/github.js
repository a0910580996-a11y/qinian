// 同步到你自己的私有 GitHub 仓库：data.json 是完整数据，旁边是能直接阅读的表格和文字。
// 每次同步一个提交，几十年的修改历史都在。附件不进仓库（太大），靠备份文件夹和完整档案。
const API = 'https://api.github.com'

export const contentsUrl = (cfg, path) => `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`

export class SyncError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function httpError(status) {
  if (status === 401) return new SyncError('auth', '令牌无效或已过期，请重新生成一个')
  if (status === 403) return new SyncError('forbidden', '令牌没有这个仓库的写入权限，或者请求太频繁了')
  if (status === 404) return new SyncError('missing', '找不到这个仓库：检查名字，以及令牌是否授权了它')
  if (status === 409 || status === 422) return new SyncError('conflict', '云端刚被另一台设备更新过')
  return new SyncError('http', `GitHub 返回了错误（${status}），稍后再试`)
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// 和 git 一样算文件的 blob sha，用来判断云端的文件是不是已经是这份内容。
export async function blobSha(text) {
  const body = new TextEncoder().encode(text)
  const head = new TextEncoder().encode(`blob ${body.length}\0`)
  const all = new Uint8Array(head.length + body.length)
  all.set(head)
  all.set(body, head.length)
  const hash = await crypto.subtle.digest('SHA-1', all)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function createGitHub(cfg, fetcher = (...args) => fetch(...args)) {
  const root = `${API}/repos/${cfg.owner}/${cfg.repo}`

  async function request(path, { method = 'GET', body, raw = false, allow = [] } = {}) {
    let response
    try {
      response = await fetcher(root + path, {
        method,
        cache: 'no-store',
        headers: {
          Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
          Authorization: `Bearer ${cfg.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    } catch {
      throw new SyncError('offline', '连不上 GitHub，稍后会自动再试')
    }
    if (allow.includes(response.status)) return { missing: response.status }
    if (!response.ok) throw httpError(response.status)
    return raw ? response.text() : response.json()
  }

  return {
    // 仓库信息：是否私有、默认分支。
    async check() {
      const info = await request('')
      return { private: !!info.private, branch: info.default_branch || 'main', push: info.permissions ? !!info.permissions.push : true }
    },

    // 读云端的 data.json；空仓库或还没有数据时 text 为 null。
    async pull(branch) {
      const ref = await request(`/git/ref/heads/${encodeURIComponent(branch)}`, { allow: [404, 409] })
      if (ref.missing) return { head: null, text: null }
      const head = ref.object.sha
      const text = await request(`/contents/data.json?ref=${head}`, { raw: true, allow: [404] })
      return { head, text: typeof text === 'string' ? text : null }
    },

    // 某个提交里所有文件的路径 → blob sha。
    async list(head) {
      const tree = await request(`/git/trees/${head}?recursive=1`)
      return new Map(tree.tree.filter(t => t.type === 'blob').map(t => [t.path, t.sha]))
    },

    // 写入一次提交（removed 里的路径删掉）；空仓库先用 contents 接口建出第一个文件。head 不是最新时抛出 conflict。
    async push(branch, head, files, message, removed = []) {
      let parent = head
      let rest = files
      if (!parent) {
        const data = files.find(f => f.path === 'data.json')
        const created = await request('/contents/data.json', { method: 'PUT', body: { message, content: toBase64(data.content) } })
        parent = created.commit.sha
        rest = files.filter(f => f !== data)
        if (!rest.length && !removed.length) return parent
      }
      const commit = await request(`/git/commits/${parent}`)
      const entries = [
        ...rest.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
        ...removed.map(path => ({ path, mode: '100644', type: 'blob', sha: null }))
      ]
      const tree = await request('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } })
      const next = await request('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [parent] } })
      await request(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: next.sha, force: false } })
      return next.sha
    }
  }
}
