// 通用工具函数

export function formatDate(date) {
  return new Date(date).toLocaleDateString('zh-CN')
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

  return date.toLocaleDateString('zh-CN')
}

export function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = String(text)
  return div.innerHTML.replace(/\n/g, '<br>')
}

export function showToast(message, type = 'info') {
  const toast = document.createElement('div')
  const background = type === 'error'
    ? '#ff6b6b'
    : type === 'success'
      ? '#22c55e'
      : '#2563eb'

  toast.textContent = message
  toast.style.position = 'fixed'
  toast.style.left = '50%'
  toast.style.bottom = '32px'
  toast.style.transform = 'translateX(-50%)'
  toast.style.maxWidth = 'calc(100vw - 32px)'
  toast.style.padding = '12px 16px'
  toast.style.borderRadius = '10px'
  toast.style.background = background
  toast.style.color = '#fff'
  toast.style.fontSize = '14px'
  toast.style.fontWeight = '700'
  toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.18)'
  toast.style.zIndex = '9999'

  document.body.appendChild(toast)
  setTimeout(() => {
    toast.remove()
  }, 2200)
}

export function showLoading(message = '加载中...') {
  let loading = document.getElementById('globalLoadingOverlay')

  if (!loading) {
    loading = document.createElement('div')
    loading.id = 'globalLoadingOverlay'
    loading.style.position = 'fixed'
    loading.style.inset = '0'
    loading.style.background = 'rgba(0, 0, 0, 0.28)'
    loading.style.display = 'flex'
    loading.style.alignItems = 'center'
    loading.style.justifyContent = 'center'
    loading.style.zIndex = '9998'

    const inner = document.createElement('div')
    inner.id = 'globalLoadingOverlayText'
    inner.style.padding = '14px 18px'
    inner.style.background = '#111827'
    inner.style.color = '#fff'
    inner.style.borderRadius = '10px'
    inner.style.fontSize = '14px'
    inner.style.fontWeight = '700'
    loading.appendChild(inner)

    document.body.appendChild(loading)
  }

  const text = document.getElementById('globalLoadingOverlayText')
  if (text) {
    text.textContent = message
  }

  loading.style.display = 'flex'
}

export function hideLoading() {
  const loading = document.getElementById('globalLoadingOverlay')
  if (loading) {
    loading.style.display = 'none'
  }
}

window.AppUI = {
  showToast,
  showLoading,
  hideLoading
}

window.AppText = {
  escapeHtml,
  formatDate,
  formatRelativeTime
}
