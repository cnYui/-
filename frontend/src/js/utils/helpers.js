// 通用工具函数

export function formatDate(date) {
  return new Date(date).toLocaleDateString('zh-CN')
}

export function showToast(message, type = 'info') {
  console.log(`[${type}] ${message}`)
}

export function showLoading(show = true) {
  console.log(show ? 'Loading...' : 'Done')
}
