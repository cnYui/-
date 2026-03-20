import { apiRequest } from './utils/api.js'
import { getAuthUserId } from './utils/auth.js'
import { escapeHtml, formatRelativeTime, showToast } from './utils/helpers.js'

let allMails = []
let currentUserId = ''
let activeCategory = null
let currentKeyword = ''
let searchInput = null
let scrollSaveTimer = null

const CATEGORY_CONFIG = {
  friend: {
    name: '朋友',
    icon: '👫',
    desc: '来自好友与伙伴的消息'
  },
  avatar: {
    name: '分身',
    icon: '🤖',
    desc: '来自AI分身与旅行总结'
  },
  promo: {
    name: '推广',
    icon: '📣',
    desc: '系统通知与推荐消息'
  }
}

function getStateKey() {
  return currentUserId ? `notes_page_state_${currentUserId}` : 'notes_page_state'
}

function readPageState() {
  try {
    const raw = localStorage.getItem(getStateKey())
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function savePageState() {
  try {
    const state = {
      activeCategory,
      keyword: currentKeyword,
      scrollY: window.scrollY || 0,
      updatedAt: Date.now()
    }
    localStorage.setItem(getStateKey(), JSON.stringify(state))
  } catch (error) {
    console.warn('保存收信箱页面状态失败:', error)
  }
}

function restorePageState() {
  const state = readPageState()
  if (!state) return 0

  if (state.activeCategory && CATEGORY_CONFIG[state.activeCategory]) {
    activeCategory = state.activeCategory
  }
  currentKeyword = state.keyword || ''
  return Number(state.scrollY) || 0
}

function classifyMailCategory(mail) {
  if (mail?.senderType === 'ai' || ['diary', 'ai_exploration', 'recommendation'].includes(mail?.mailType)) {
    return 'avatar'
  }

  if (mail?.senderType === 'system' || mail?.mailType === 'system') {
    return 'promo'
  }

  return 'friend'
}

function getCategoryMails(category, keyword = '') {
  const source = allMails.filter((mail) => classifyMailCategory(mail) === category)
  if (!keyword) return source

  return source.filter((mail) => {
    const text = `${mail?.title || ''} ${mail?.content || ''}`
    return text.includes(keyword)
  })
}

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
    renderCurrentView()
  } catch (error) {
    console.error('❌ 加载邮件失败:', error)
    showEmptyState('加载失败', '无法加载邮件列表，请重试')
  }
}

function renderCurrentView() {
  if (!activeCategory) {
    renderCategoryCards()
    updateSearchPlaceholder()
    return
  }

  renderCategoryMails(activeCategory)
  updateSearchPlaceholder()
}

function renderCategoryCards() {
  const container = document.getElementById('mailsContainer')
  if (!container) return

  const hasAnyMail = allMails.length > 0
  if (!hasAnyMail) {
    showEmptyState('收信箱是空的', '完成旅行后，你的AI分身会给你写信哦~')
    return
  }

  const cards = Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
    const mails = getCategoryMails(key, currentKeyword)
    const unreadCount = mails.filter((mail) => !mail.isRead).length
    const latest = mails[0]
    const latestTitle = latest?.title ? escapeHtml(latest.title) : '暂无信件'

    return `
      <div class="note-card mail-category-card" onclick="openCategory('${key}')">
        <div class="note-title">${config.icon} ${config.name}</div>
        <div class="note-text">${escapeHtml(config.desc)}</div>
        <div class="note-meta">
          <span>共 ${mails.length} 封${unreadCount > 0 ? `，未读 ${unreadCount} 封` : ''}</span>
          <span style="max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${latestTitle}</span>
        </div>
      </div>
    `
  }).join('')

  container.innerHTML = cards
}

function renderCategoryMails(category) {
  const mails = getCategoryMails(category, currentKeyword)
  if (!mails.length) {
    showEmptyState('暂无信件', '当前分类下还没有可展示的邮件简介')
    return
  }

  renderMails(mails, category)
}

function renderMails(mails, category) {
  const container = document.getElementById('mailsContainer')
  if (!container) return

  let html = `
    <div class="category-view-header">
      <button class="category-back-btn" onclick="backToCategories()">
        <i class="ri-arrow-left-line"></i> 返回分类
      </button>
      <span class="category-name">${CATEGORY_CONFIG[category]?.name || '邮件'}</span>
    </div>
  `

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
  currentKeyword = keyword || ''
  savePageState()
  renderCurrentView()
}

async function openMail(mailId) {
  try {
    await apiRequest(`/mails/${mailId}/read`, { method: 'PUT' })

    const mailIndex = allMails.findIndex((m) => m.id === mailId)
    if (mailIndex !== -1) {
      allMails[mailIndex].isRead = true
    }

    savePageState()

    window.location.href = `/pages/mobile/note-detail.html?id=${encodeURIComponent(mailId)}`
  } catch (error) {
    console.error('❌ 获取邮件失败:', error)
    showToast(`获取邮件失败: ${error.message}`, 'error')
  }
}

function showEmptyState(title, desc) {
  const container = document.getElementById('mailsContainer')
  if (!container) return

  const extra = activeCategory
    ? `<div class="category-view-header"><button class="category-back-btn" onclick="backToCategories()"><i class="ri-arrow-left-line"></i> 返回分类</button><span class="category-name">${CATEGORY_CONFIG[activeCategory]?.name || '邮件'}</span></div>`
    : ''

  container.innerHTML = `
    ${extra}
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

function updateSearchPlaceholder() {
  if (!searchInput) return
  if (activeCategory && CATEGORY_CONFIG[activeCategory]) {
    searchInput.placeholder = `搜索${CATEGORY_CONFIG[activeCategory].name}邮件简介...`
    return
  }
  searchInput.placeholder = '搜索分类或信件...'
}

function openCategory(category) {
  if (!CATEGORY_CONFIG[category]) return
  activeCategory = category
  savePageState()
  renderCurrentView()
  window.scrollTo(0, 0)
}

function backToCategories() {
  activeCategory = null
  savePageState()
  renderCurrentView()
  window.scrollTo(0, 0)
}

document.addEventListener('DOMContentLoaded', async () => {
  const userId = getUserId()
  currentUserId = userId || ''
  const restoredScrollY = restorePageState()

  searchInput = document.querySelector('.search-input')
  if (searchInput) {
    searchInput.value = currentKeyword
  }

  if (userId) {
    await loadMails(userId)

    if (restoredScrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, restoredScrollY)
      })
    }
  } else {
    showEmptyState('未登录', '请先登录以查看你的收信箱')
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterMails(e.target.value)
    })
  }

  window.addEventListener('scroll', () => {
    if (scrollSaveTimer) {
      clearTimeout(scrollSaveTimer)
    }
    scrollSaveTimer = setTimeout(() => {
      savePageState()
    }, 120)
  }, { passive: true })

  window.addEventListener('pageshow', () => {
    const state = readPageState()
    if (!state) return
    requestAnimationFrame(() => {
      window.scrollTo(0, Number(state.scrollY) || 0)
    })
  })
})

window.openMail = openMail
window.openCategory = openCategory
window.backToCategories = backToCategories
