// 离线支持：联网时优先取最新文件（3 秒没回应就用缓存），断网时用缓存。
// 只处理本站的 GET 请求，从不碰你的记录——记录在 IndexedDB 里，与这里无关。
const VERSION = '20261013-15'
const CACHE = `qinian-${VERSION}`
// FILES 由 scripts/release.js 生成，不要手改
const FILES = [
  './',
  'index.html',
  'styles.css',
  'theme.js',
  'favicon.svg',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/app.js',
  'src/core/dates.js',
  'src/core/github.js',
  'src/core/html.js',
  'src/core/migrate.js',
  'src/core/money.js',
  'src/core/store.js',
  'src/core/zip.js',
  'src/domain/archive.js',
  'src/domain/focus.js',
  'src/domain/ledger.js',
  'src/domain/library.js',
  'src/domain/life.js',
  'src/domain/merge.js',
  'src/domain/milestones.js',
  'src/domain/overview.js',
  'src/domain/schedule.js',
  'src/domain/seed.js',
  'src/domain/skill.js',
  'src/domain/timelog.js',
  'src/pages/focus.js',
  'src/pages/ledger.js',
  'src/pages/library.js',
  'src/pages/milestones.js',
  'src/pages/overview.js',
  'src/pages/review.js',
  'src/pages/settings.js',
  'src/pages/skill.js',
  'src/pages/today.js',
  'src/ui/avatar.js',
  'src/ui/backup.js',
  'src/ui/files.js',
  'src/ui/icons.js',
  'src/ui/parts.js',
  'src/ui/shared.js',
  'src/ui/sync.js',
  'src/ui/theme.js'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('qinian-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  const url = new URL(request.url)
  try {
    const response = await Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))])
    if (response.ok && response.type === 'basic') cache.put(url.origin + url.pathname, response.clone())
    return response
  } catch {
    const cached = (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? await cache.match('./') : null)
    if (cached) return cached
    throw new Error('offline')
  }
}
