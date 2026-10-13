// 金额一律以“分”为整数存储，避免浮点误差。
export function parseAmount(input) {
  const text = String(input ?? '').trim().replace(/[¥￥,，\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [yuan, fen = ''] = text.split('.')
  const cents = Number(yuan) * 100 + Number(fen.padEnd(2, '0'))
  return cents > 0 && cents < 1e11 ? cents : null
}

export function yuan(cents, { sign = false, symbol = true } = {}) {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const whole = Math.floor(abs / 100).toLocaleString('zh-CN')
  const fen = abs % 100
  const body = fen ? `${whole}.${String(fen).padStart(2, '0')}` : whole
  const prefix = negative ? '−' : sign && cents > 0 ? '+' : ''
  return `${prefix}${symbol ? '¥' : ''}${body}`
}

// 输入框回填用：1250 → '12.5'
export function amountInput(cents) {
  if (!cents) return ''
  return (cents / 100).toFixed(2).replace(/\.?0+$/, '')
}
