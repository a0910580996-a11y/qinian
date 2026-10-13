// 在首屏绘制前读取手动选择的主题，避免深浅色闪一下。
try {
  const theme = JSON.parse(localStorage.getItem('qinian:theme'))
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch {}
