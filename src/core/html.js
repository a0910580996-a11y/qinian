// 极简模板：插值默认转义，只有 raw() 包裹的片段原样输出。用户写下的每个字都经过这里。
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c])

class Raw {
  constructor(text) {
    this.text = text
  }
  toString() {
    return this.text
  }
}

export const raw = text => new Raw(String(text))

function render(value) {
  if (value === null || value === undefined || value === false) return ''
  if (value instanceof Raw) return value.text
  if (Array.isArray(value)) return value.map(render).join('')
  return escapeHtml(value)
}

export function html(strings, ...values) {
  let out = strings[0]
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1]
  })
  return raw(out)
}

// CSP 禁止内联 style，按数据变化的尺寸写成 data-vars="w:42%;x:3%"，挂载后由脚本设置为 CSS 变量。
export const vars = obj => Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(';')

export function applyVars(root) {
  for (const el of root.querySelectorAll('[data-vars]')) {
    for (const pair of el.dataset.vars.split(';')) {
      const i = pair.indexOf(':')
      if (i > 0) el.style.setProperty('--' + pair.slice(0, i), pair.slice(i + 1))
    }
  }
}

export const pct = (part, whole) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0).toFixed(2) + '%'
