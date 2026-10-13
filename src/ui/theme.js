import { html } from '../core/html.js'
import { icon } from './icons.js'

// 与 Claude 相同的逻辑：默认跟随系统，也可以手动固定为浅色或深色。
// 手动选择同时写进 localStorage，让 theme.js 在首屏绘制前就能用上，不闪。
export const THEMES = [
  { id: 'light', name: '浅色', icon: 'sun' },
  { id: 'dark', name: '深色', icon: 'moon' },
  { id: 'auto', name: '跟随系统', icon: 'monitor' }
]

const BAR = { light: '#f5f3ee', dark: '#121211' }

export function applyTheme(theme, { animate = false } = {}) {
  const root = document.documentElement
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-fade')
    setTimeout(() => root.classList.remove('theme-fade'), 350)
  }
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
  else delete root.dataset.theme
  // 手机浏览器顶栏颜色：跟随系统时按媒体查询各自生效，手动时两条都改成所选主题。
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? 'dark' : 'light'
    meta.content = BAR[theme === 'light' || theme === 'dark' ? theme : own]
  }
  try {
    localStorage.setItem('qinian:theme', JSON.stringify(theme || 'auto'))
  } catch {}
}

export function themeSwitch(current = 'auto', { labels = true } = {}) {
  return html`<div class="theme-switch ${labels ? '' : 'is-compact'}" role="radiogroup" aria-label="外观">
    ${THEMES.map(t => html`<button type="button" role="radio" class="theme-option ${t.id === current ? 'is-on' : ''}" aria-checked="${t.id === current}" data-action="set-theme" data-value="${t.id}" title="${t.name}">${icon(t.icon)}${labels ? html`<span>${t.name}</span>` : ''}</button>`)}
  </div>`
}
