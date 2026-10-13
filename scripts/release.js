// 发布前运行：npm run release
// 1. 统一版本号：index.html 里的 ?v= 与 sw.js 的 VERSION 一起更新，浏览器和离线缓存都会换成新版本；
// 2. 重新生成离线缓存清单（sw.js 里的 FILES），新加的文件不会漏。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = path => readFileSync(join(root, path), 'utf8')
const write = (path, text) => writeFileSync(join(root, path), text)
const walk = dir =>
  readdirSync(join(root, dir)).flatMap(name => {
    const path = `${dir}/${name}`
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path]
  })

const now = new Date()
const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
const html = read('index.html')
const current = html.match(/\?v=(\d{8})-(\d+)/)
const version = `${date}-${current && current[1] === date ? Number(current[2]) + 1 : 1}`
write('index.html', html.replace(/\?v=\d{8}-\d+/g, `?v=${version}`))

const files = ['./', 'index.html', 'styles.css', 'theme.js', 'favicon.svg', 'manifest.webmanifest', ...(existsSync(join(root, 'icons')) ? walk('icons') : []), ...walk('src').filter(f => f.endsWith('.js'))]
const sw = read('sw.js')
  .replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`)
  .replace(/const FILES = \[[\s\S]*?\]/, `const FILES = [\n${files.map(f => `  '${f}'`).join(',\n')}\n]`)
write('sw.js', sw)
console.log(`版本 ${version} · 离线缓存 ${files.length} 个文件`)
