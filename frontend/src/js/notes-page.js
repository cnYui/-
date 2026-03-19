import { apiRequest } from './utils/api.js'
import { getAuthUserId } from './utils/auth.js'
import { escapeHtml, formatRelativeTime, showToast } from './utils/helpers.js'

let allMails = []

function getUserId() {
  return getAuthUserId()
}

async function loadMails(userId) {
  try {
    const result = await apiRequest(`/mails/user/${userId}`)
    if (!result?.success) {
      throw new Error(result?.error || '加载邮件失败')
    }

    allMails = result.data || []
    renderMails(allMails)
  } catch (error) {
    console.error('❌ 加载邮件失败:', error)
    showEmptyState('加载失败', '无法加载邮件列表，请重试')
  }
}

function renderMails(mails) {
  const container = document.getElementById('mailsContainer')
  if (!container) return

  if (mails.length === 0) {
    showEmptyState('收信箱是空的', '完成旅行后，你的AI分身会给你写信哦~')
    return
  }

  let html = ''

  mails.forEach((mail) => {
    const typeIcon = getMailTypeIcon(mail.mailType)
    const typeClass = getMailTypeClass(mail.mailType)
    const typeName = getMailTypeName(mail.mailType)

    html += `
      <div class="note-card" onclick="openMail(${mail.id})">
        <div class="note-content">
          ${mail.imageUrl ? `<img src="${mail.imageUrl}" class="mail-image" alt="邮件图片">` : ''}
          <div class="note-title">
            <span class="mail-type-tag ${typeClass}">${typeName}</span>
            ${typeIcon} ${escapeHtml(mail.title)}
            ${!mail.isRead ? '<span class="unread-badge"></span>' : ''}
          </div>
          <div class="note-text">${escapeHtml((mail.content || '').substring(0, 100))}${(mail.content || '').length > 100 ? '...' : ''}</div>
          ${getRecommendationPreviewHtml(mail)}
          <div class="note-meta">
            <div class="note-location">
              <i class="ri-time-line"></i>
              <span>${formatRelativeTime(mail.createdAt)}</span>
            </div>
            <span>${escapeHtml(getSenderDisplayName(mail))}</span>
          </div>
        </div>
      </div>
    `
  })

  container.innerHTML = html
}

function getRecommendationPreviewHtml(mail) {
  const recommended = mail?.extraData?.recommended
  if (!Array.isArray(recommended) || recommended.length === 0) {
    return ''
  }

  const names = recommended
    .slice(0, 2)
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean)

  if (names.length === 0) {
    return ''
  }

  return `<div class="note-text" style="margin-top:6px;color:#1565c0;font-weight:600;">推荐：${escapeHtml(names.join('、'))}</div>`
}

function filterMails(keyword) {
  if (!keyword) {
    renderMails(allMails)
    return
  }

  const filtered = allMails.filter((mail) =>
    (mail.title || '').includes(keyword) ||
    (mail.content || '').includes(keyword)
  )
  renderMails(filtered)
}

async function openMail(mailId) {
  try {
    await apiRequest(`/mails/${mailId}/read`, { method: 'PUT' })

    const mailIndex = allMails.findIndex((m) => m.id === mailId)
    if (mailIndex !== -1) {
      allMails[mailIndex].isRead = true
    }

    window.location.href = `/pages/mobile/note-detail.html?id=${encodeURIComponent(mailId)}`
  } catch (error) {
    console.error('❌ 获取邮件失败:', error)
    showToast(`获取邮件失败: ${error.message}`, 'error')
  }
}

function showEmptyState(title, desc) {
  const container = document.getElementById('mailsContainer')
  if (!container) return

  container.innerHTML = `
    <div class="empty-state">
      <i class="ri-mail-line"></i>
      <p style="font-size: 18px; font-weight: 700;">${title}</p>
      <p>${desc}</p>
    </div>
  `
}

function getMailTypeIcon(type) {
  const icons = {
    diary: '📝',
    system: '📢',
    friend: '💌',
    ai_exploration: '🤖',
    recommendation: '✨'
  }
  return icons[type] || '📧'
}

function getMailTypeClass(type) {
  const classes = {
    diary: 'mail-type-diary',
    system: 'mail-type-system',
    friend: 'mail-type-friend',
    ai_exploration: 'mail-type-ai',
    recommendation: 'mail-type-ai'
  }
  return classes[type] || 'mail-type-system'
}

function getMailTypeName(type) {
  const names = {
    diary: '旅行日记',
    system: '系统通知',
    friend: '好友来信',
    ai_exploration: 'AI探索',
    recommendation: '推荐'
  }
  return names[type] || '邮件'
}

function getSenderDisplayName(mail) {
  if (mail?.extraData?.senderName) {
    return mail.extraData.senderName
  }

  if (mail?.senderType === 'ai') return 'AI分身'
  if (mail?.senderType === 'system') return '系统'
  return '好友'
}

document.addEventListener('DOMContentLoaded', async () => {
  const userId = getUserId()
  if (userId) {
    await loadMails(userId)
  } else {
    showEmptyState('未登录', '请先登录以查看你的收信箱')
  }

  const searchInput = document.querySelector('.search-input')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterMails(e.target.value)
    })
  }
})

window.openMail = openMail
