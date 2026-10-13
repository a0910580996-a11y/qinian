// 极简 ZIP：写出时只用“存储”方式（不压缩）；读取时支持“存储”和常见的“deflate”压缩，
// 所以用 Windows 自带的“压缩”或其他软件重新打包的备份也能读回。
// 文件内容按块计算 CRC32，不把大视频整个读进内存。
const encoder = new TextEncoder()
const decoder = new TextDecoder()
let table = null

function crcTable() {
  if (table) return table
  table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

export async function crc32(blob) {
  const t = crcTable()
  let crc = 0xffffffff
  const CHUNK = 4 << 20
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer())
    for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosStamp(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

// entries: [{ name, data: Blob | string }]
export async function createZip(entries, now = new Date()) {
  const { time, date } = dosStamp(now)
  const parts = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const blob = entry.data instanceof Blob ? entry.data : new Blob([entry.data])
    const crc = await crc32(blob)
    const size = blob.size
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // 文件名是 UTF-8
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, name.length, true)
    parts.push(local.buffer, name, blob)
    const record = new DataView(new ArrayBuffer(46))
    record.setUint32(0, 0x02014b50, true)
    record.setUint16(4, 20, true)
    record.setUint16(6, 20, true)
    record.setUint16(8, 0x0800, true)
    record.setUint16(12, time, true)
    record.setUint16(14, date, true)
    record.setUint32(16, crc, true)
    record.setUint32(20, size, true)
    record.setUint32(24, size, true)
    record.setUint16(28, name.length, true)
    record.setUint32(42, offset, true)
    central.push(record.buffer, name)
    offset += 30 + name.length + size
  }
  const centralSize = central.reduce((s, p) => s + p.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}

async function inflate(blob) {
  if (typeof DecompressionStream === 'undefined') throw new Error('这个浏览器不能解压，请换用新版 Chrome、Edge 或 Safari。')
  return new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
}

export async function readZip(blob) {
  const tailSize = Math.min(blob.size, 65557)
  const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer())
  let endAt = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      endAt = i
      break
    }
  }
  if (endAt < 0) throw new Error('不是有效的 zip 备份。')
  const count = tail.getUint16(endAt + 10, true)
  const centralSize = tail.getUint32(endAt + 12, true)
  const centralOffset = tail.getUint32(endAt + 16, true)
  const dir = new DataView(await blob.slice(centralOffset, centralOffset + centralSize).arrayBuffer())
  const entries = []
  let p = 0
  for (let n = 0; n < count; n++) {
    if (dir.getUint32(p, true) !== 0x02014b50) throw new Error('zip 目录损坏。')
    const method = dir.getUint16(p + 10, true)
    const packed = dir.getUint32(p + 20, true)
    const nameLength = dir.getUint16(p + 28, true)
    const extraLength = dir.getUint16(p + 30, true)
    const commentLength = dir.getUint16(p + 32, true)
    const localOffset = dir.getUint32(p + 42, true)
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength))
    if (method !== 0 && method !== 8) throw new Error('这个压缩包用了不支持的压缩方式。')
    const head = new DataView(await blob.slice(localOffset, localOffset + 30).arrayBuffer())
    const start = localOffset + 30 + head.getUint16(26, true) + head.getUint16(28, true)
    const raw = blob.slice(start, start + packed)
    if (!name.endsWith('/')) entries.push({ name, blob: method === 0 ? raw : await inflate(raw) })
    p += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
