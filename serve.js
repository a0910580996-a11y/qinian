// 本地预览：node serve.js，然后打开 http://127.0.0.1:4180
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const port = Number(process.env.PORT) || 4180

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!path.startsWith(root) || pathname.split('/').some(p => p.startsWith('.'))) {
      res.writeHead(403)
      return res.end()
    }
    const body = await readFile(path)
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`七年 · 人生中台：http://127.0.0.1:${port}`))
