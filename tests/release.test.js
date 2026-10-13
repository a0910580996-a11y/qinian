import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const read = path => readFileSync(join(root, path), 'utf8')

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap(name => {
    const path = join(dir, name)
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path]
  })
}

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))
}

test('深色令牌：手动选择与跟随系统两处一致', () => {
  const css = read('styles.css')
  const manual = css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1]
  const auto = css.match(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/)[1]
  assert.deepEqual(tokens(auto), tokens(manual))
})

test('CSP：页面与模板里没有内联脚本和内联样式', () => {
  const html = read('index.html')
  assert.match(html, /Content-Security-Policy/)
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/)
  for (const file of walk('src').filter(f => f.endsWith('.js'))) {
    assert.doesNotMatch(read(file), /\sstyle="/, `${file} 含有内联 style 属性`)
    assert.doesNotMatch(read(file), /<script/i, `${file} 拼接了 script 标签`)
  }
})

test('不引入外部资源与统计代码', () => {
  const sources = ['index.html', 'styles.css', ...walk('src')].map(read).join('\n')
  assert.doesNotMatch(sources, /https?:\/\/(?!www\.w3\.org|api\.github\.com|github\.com)[\w-]+\.[\w.-]+/)
  assert.doesNotMatch(sources, /analytics|gtag|umami|plausible|baidu|cnzz/i)
})

test('离线缓存：清单覆盖全部模块与图标，版本号与页面一致（发布前运行 npm run release）', () => {
  const sw = read('sw.js')
  const listed = new Set([...sw.matchAll(/^\s+'([^']+)',?$/gm)].map(m => m[1]))
  const expected = [...walk('src').filter(f => f.endsWith('.js')), ...walk('icons'), 'index.html', 'styles.css', 'theme.js', 'manifest.webmanifest'].map(f => f.split(sep).join('/'))
  for (const file of expected) assert.ok(listed.has(file), `sw.js 的 FILES 缺少 ${file}`)
  const version = read('index.html').match(/\?v=([\d-]+)/)[1]
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version)
})
