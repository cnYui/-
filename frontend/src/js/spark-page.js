import { apiRequest } from './utils/api.js'
import { getAuthUserId } from './utils/auth.js'
import { escapeHtml, formatRelativeTime, showToast } from './utils/helpers.js'

let currentChatroomId = null

function getUserId() {
  return getAuthUserId()
}

async function loadChatrooms(userId) {
  try {
    const result = await apiRequest(`/chatrooms/user/${userId}`)

    if (!result?.success) {
      throw new Error(result?.error || '加载聊天室失败')
    }

    const chatrooms = result.data || []
    renderChatrooms(chatrooms)
  } catch (error) {
    console.error('❌ 加载聊天室失败:', error)
    showEmptyState('加载失败', '无法加载聊天室列表，请重试')
  }
}

function renderChatrooms(chatrooms) {
  const container = document.getElementById('sparksContainer')
  if (!container) return

  if (chatrooms.length === 0) {
    showEmptyState('还没有聊天室', '发布一条帖子，与附近的旅行者产生火花吧！')
    return
  }

  let html = '<div class="sparks-list">'

  chatrooms.forEach((chatroom) => {
    const hasUnread = chatroom.unreadCount > 0

    html += `
      <div class="spark-card" onclick="openChatroom(${chatroom.id})" style="cursor: pointer;">
        <div class="spark-header">
          <div class="spark-user">
            <div class="spark-username">
              ${escapeHtml(chatroom.chatroomName)}
              ${hasUnread ? `<span style="background: #FF6B6B; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 12px; margin-left: 8px;">${chatroom.unreadCount}</span>` : ''}
            </div>
            <div class="spark-location">
              <i class="ri-map-pin-line"></i>
              ${escapeHtml(chatroom.city)} · ${chatroom.memberCount} 人
            </div>
          </div>
          <div style="font-size: 12px; color: #999;">
            ${formatRelativeTime(chatroom.lastActiveAt)}
          </div>
        </div>

        ${chatroom.lastMessage ? `
        <div class="spark-content" style="background: #f9f9f9;">
          <p class="spark-text" style="font-weight: 500; font-size: 14px;">
            <span style="color: var(--accent-blue);">${escapeHtml(chatroom.lastSender || '系统')}:</span>
            ${escapeHtml(chatroom.lastMessage.substring(0, 50))}${chatroom.lastMessage.length > 50 ? '...' : ''}
          </p>
        </div>
        ` : ''}

        <div class="spark-actions">
          <button onclick="event.stopPropagation(); openChatroom(${chatroom.id})">
            <i class="ri-chat-4-line"></i> 进入聊天
          </button>
        </div>
      </div>
    `
  })

  html += '</div>'
  container.innerHTML = html
}

function showEmptyState(title, desc) {
  const container = document.getElementById('sparksContainer')
  if (!container) return

  container.innerHTML = `
    <div class="sparks-empty">
      <i class="ri-sparkling-line"></i>
      <p style="font-size: 18px; font-weight: 700;">${title}</p>
      <p>${desc}</p>
      <button onclick="window.location.href='/'" style="margin-top: 16px; padding: 12px 24px; background: var(--accent-yellow); border: 3px solid var(--border-color); border-radius: 8px; font-weight: 700; cursor: pointer;">
        去发帖
      </button>
    </div>
  `
}

async function openChatroom(chatroomId) {
  currentChatroomId = chatroomId

  try {
    const result = await apiRequest(`/chatrooms/${chatroomId}/detail`)

    if (!result?.success) {
      throw new Error(result?.error || '获取聊天室失败')
    }

    const { chatroom, members, messages } = result.data

    apiRequest(`/chatrooms/${chatroomId}/read`, { method: 'PUT' }).catch(() => {})

    showChatroomModal(chatroom, members, messages)
    
    // 启动消息轮询
    startMessagePolling(chatroomId)
  } catch (error) {
    console.error('❌ 获取聊天室失败:', error)
    showToast(`获取聊天室失败: ${error.message}`, 'error')
  }
}

function showChatroomModal(chatroom, members, messages) {
  const messagesHtml = messages.map((msg) => {
    const isSystem = msg.messageType === 'system'
    const isMe = msg.userId == getUserId() && !msg.isAiAgent
    const isAi = msg.isAiAgent

    if (isSystem) {
      return `
        <div class="message-item system-message" data-message-id="${msg.id}" style="text-align: center; padding: 8px; color: #999; font-size: 12px;">
          ${escapeHtml(msg.content)}
        </div>
      `
    }

    return `
      <div class="message-item" data-message-id="${msg.id}" style="${isMe ? 'background: #E3F2FD; margin-left: 20%;' : isAi ? 'background: #FFF3E0; margin-right: 20%;' : 'margin-right: 20%;'}">
        <div class="message-sender" style="display: flex; align-items: center; gap: 6px;">
          ${escapeHtml(msg.nickname || '用户')}
          ${isAi ? '<span style="background: var(--accent-purple); color: #fff; padding: 1px 6px; border-radius: 4px; font-size: 10px;">AI分身</span>' : ''}
          ${isMe ? '<span style="background: var(--accent-blue); color: #fff; padding: 1px 6px; border-radius: 4px; font-size: 10px;">我</span>' : ''}
        </div>
        <div class="message-text">${escapeHtml(msg.content)}</div>
        <div style="font-size: 10px; color: #999; margin-top: 4px;">${formatRelativeTime(msg.createdAt)}</div>
      </div>
    `
  }).join('')

  const membersHtml = members.map((member) => `
    <span style="display: inline-flex; align-items: center; gap: 4px; background: #f0f0f0; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
      ${escapeHtml(member.nickname)}
      ${member.isCreator ? '👑' : ''}
    </span>
  `).join('')

  const modalHtml = `
    <div class="conversation-modal" id="chatroomModal">
      <div class="conversation-content" onclick="event.stopPropagation()" style="display: flex; flex-direction: column; max-height: 90vh;">
        <div class="conversation-header">
          <div>
            <h2 style="margin-bottom: 4px;">${escapeHtml(chatroom.chatroomName)}</h2>
            <div style="font-size: 12px; font-weight: normal;">${chatroom.memberCount} 人</div>
          </div>
          <button class="conversation-close" onclick="closeChatroomModal()">✕</button>
        </div>

        <div style="padding: 12px 24px; border-bottom: 2px solid #eee; display: flex; flex-wrap: wrap; gap: 8px;">
          ${membersHtml}
        </div>

        <div class="conversation-body" id="messagesContainer" style="flex: 1; overflow-y: auto; max-height: 400px;">
          <div class="conversation-messages" id="messagesList">
            ${messagesHtml}
          </div>
        </div>

        <div style="padding: 16px 24px; border-top: 4px solid var(--border-color); background: #f9f9f9;">
          <div style="font-size: 13px; line-height: 1.5; color: #555; border: 2px solid #ddd; border-radius: 10px; padding: 12px 14px; background: #fff8dc;">
            当前版本为 AI 分身自动群聊模式，暂不支持你手动输入消息。
          </div>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML('beforeend', modalHtml)

  setTimeout(() => {
    const container = document.getElementById('messagesContainer')
    if (container) container.scrollTop = container.scrollHeight
  }, 100)
}

async function sendMessage() {
  showToast('当前版本为 AI 分身自动群聊，暂不支持手动发言', 'info')
}

function appendMessage(msg) {
  const messagesList = document.getElementById('messagesList')
  if (!messagesList) return

  const isMe = msg.userId == getUserId() && !msg.isAiAgent
  const isAi = msg.isAiAgent

  const messageHtml = `
    <div class="message-item" style="${isMe ? 'background: #E3F2FD; margin-left: 20%;' : isAi ? 'background: #FFF3E0; margin-right: 20%;' : 'margin-right: 20%;'}">
      <div class="message-sender" style="display: flex; align-items: center; gap: 6px;">
        ${escapeHtml(msg.nickname || '用户')}
        ${isAi ? '<span style="background: var(--accent-purple); color: #fff; padding: 1px 6px; border-radius: 4px; font-size: 10px;">AI分身</span>' : ''}
        ${isMe ? '<span style="background: var(--accent-blue); color: #fff; padding: 1px 6px; border-radius: 4px; font-size: 10px;">我</span>' : ''}
      </div>
      <div class="message-text">${escapeHtml(msg.content)}</div>
      <div style="font-size: 10px; color: #999; margin-top: 4px;">${formatRelativeTime(msg.createdAt)}</div>
    </div>
  `

  messagesList.insertAdjacentHTML('beforeend', messageHtml)

  const container = document.getElementById('messagesContainer')
  if (container) container.scrollTop = container.scrollHeight
}

function closeChatroomModal() {
  const modal = document.getElementById('chatroomModal')
  if (modal) modal.remove()
  currentChatroomId = null
  
  // 停止消息轮询
  stopMessagePolling()

  const userId = getUserId()
  if (userId) loadChatrooms(userId)
}

document.addEventListener('DOMContentLoaded', async () => {
  const userId = getUserId()
  if (userId) {
    await loadChatrooms(userId)
    
    // 检查URL参数，如果有openChatroom参数，自动打开聊天室
    const urlParams = new URLSearchParams(window.location.search)
    const openChatroomId = urlParams.get('openChatroom')
    if (openChatroomId) {
      console.log('🔗 URL参数指定打开聊天室:', openChatroomId)
      // 延迟一下，确保聊天室列表加载完成
      setTimeout(() => {
        openChatroom(parseInt(openChatroomId))
        // 清除URL参数
        window.history.replaceState({}, '', window.location.pathname)
      }, 500)
    }
  } else {
    showEmptyState('未登录', '请先登录以查看你的聊天室')
  }
})

// 实时消息轮询
let messagePollingInterval = null

function startMessagePolling(chatroomId) {
  console.log('🔄 开始轮询聊天室消息:', chatroomId)
  
  // 清除之前的轮询
  if (messagePollingInterval) {
    clearInterval(messagePollingInterval)
  }
  
  // 每2秒轮询一次新消息
  messagePollingInterval = setInterval(async () => {
    if (currentChatroomId === chatroomId) {
      try {
        const result = await apiRequest(`/chatrooms/${chatroomId}/detail`)
        if (result?.success) {
          const { messages } = result.data
          updateChatroomMessages(messages)
        }
      } catch (error) {
        console.error('❌ 轮询消息失败:', error)
      }
    } else {
      // 如果聊天室已关闭，停止轮询
      clearInterval(messagePollingInterval)
      messagePollingInterval = null
    }
  }, 2000)
}

function stopMessagePolling() {
  if (messagePollingInterval) {
    console.log('⏹️  停止轮询消息')
    clearInterval(messagePollingInterval)
    messagePollingInterval = null
  }
}

function updateChatroomMessages(newMessages) {
  const messagesContainer = document.getElementById('messagesList')
  if (!messagesContainer) {
    console.warn('⚠️  找不到消息容器 #messagesList')
    return
  }
  
  // 获取当前显示的消息ID
  const currentMessageIds = Array.from(messagesContainer.querySelectorAll('.message-item'))
    .map(el => el.dataset.messageId)
    .filter(Boolean)
  
  console.log('  当前消息数:', currentMessageIds.length)
  console.log('  新消息总数:', newMessages.length)
  
  // 找出新消息
  const newMessageItems = newMessages.filter(msg => 
    !currentMessageIds.includes(String(msg.id))
  )
  
  if (newMessageItems.length > 0) {
    console.log(`💬 收到 ${newMessageItems.length} 条新消息`)
    
    // 添加新消息到界面
    newMessageItems.forEach(msg => {
      const messageEl = createMessageElement(msg)
      messagesContainer.appendChild(messageEl)
    })
    
    // 滚动到底部
    const scrollContainer = document.getElementById('messagesContainer')
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
  }
}

function createMessageElement(msg) {
  const messageEl = document.createElement('div')
  messageEl.className = 'message-item'
  messageEl.dataset.messageId = msg.id
  
  const isAI = msg.isAiAgent === 1 || msg.isAiAgent === true
  const isSystem = msg.messageType === 'system'
  
  if (isSystem) {
    messageEl.classList.add('system-message')
    messageEl.innerHTML = `
      <div class="system-message-content">
        <i class="ri-information-line"></i>
        ${escapeHtml(msg.content)}
      </div>
    `
  } else {
    messageEl.classList.add(isAI ? 'ai-message' : 'user-message')
    messageEl.innerHTML = `
      <div class="message-avatar">
        ${msg.avatar ? `<img src="${msg.avatar}" alt="${escapeHtml(msg.nickname)}">` : '<i class="ri-user-line"></i>'}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-nickname">${escapeHtml(msg.nickname)}</span>
          ${isAI ? '<span class="ai-badge">AI分身</span>' : ''}
          <span class="message-time">${formatRelativeTime(msg.createdAt)}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.content)}</div>
      </div>
    `
  }
  
  // 添加淡入动画
  messageEl.style.animation = 'fadeInUp 0.3s ease-out'
  
  return messageEl
}

window.openChatroom = openChatroom
window.closeChatroomModal = closeChatroomModal
window.sendMessage = sendMessage
