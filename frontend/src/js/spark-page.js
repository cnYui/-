import { apiJsonRequest, apiRequest } from './utils/api.js'
import { getAuthUserId } from './utils/auth.js'
import { escapeHtml, formatRelativeTime, showToast } from './utils/helpers.js'
import { getCachedUserName } from './utils/user-cache.js'

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
        <div style="text-align: center; padding: 8px; color: #999; font-size: 12px;">
          ${escapeHtml(msg.content)}
        </div>
      `
    }

    return `
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

        <div style="padding: 16px 24px; border-top: 4px solid var(--border-color); display: flex; gap: 12px;">
          <input type="text" id="messageInput" placeholder="说点什么..."
            style="flex: 1; padding: 12px; border: 3px solid var(--border-color); border-radius: 8px; font-size: 14px;"
            onkeypress="if(event.key==='Enter') sendMessage()">
          <button onclick="sendMessage()"
            style="padding: 12px 20px; background: var(--accent-blue); color: #fff; border: 3px solid var(--border-color); border-radius: 8px; font-weight: 700; cursor: pointer;">
            发送
          </button>
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
  const input = document.getElementById('messageInput')
  const content = input?.value.trim()

  if (!content || !currentChatroomId) return

  input.value = ''

  try {
    const result = await apiJsonRequest('/chatrooms/message', {
      method: 'POST',
      body: {
        chatroomId: currentChatroomId,
        content,
        isAiAgent: false
      }
    })

    if (result.success) {
      appendMessage({
        nickname: getCachedUserName(),
        content,
        isAiAgent: false,
        userId: getUserId(),
        createdAt: new Date().toISOString()
      })

      const aiResult = await apiJsonRequest('/chatrooms/generate-responses', {
        method: 'POST',
        body: {
          chatroomId: currentChatroomId,
          triggerMessage: content
        }
      })

      if (aiResult.success && aiResult.data.responses) {
        for (const resp of aiResult.data.responses) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          appendMessage(resp)
        }
      }
    }
  } catch (error) {
    console.error('❌ 发送消息失败:', error)
    showToast(`发送失败: ${error.message}`, 'error')
  }
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

  const userId = getUserId()
  if (userId) loadChatrooms(userId)
}

document.addEventListener('DOMContentLoaded', async () => {
  const userId = getUserId()
  if (userId) {
    await loadChatrooms(userId)
  } else {
    showEmptyState('未登录', '请先登录以查看你的聊天室')
  }
})

window.openChatroom = openChatroom
window.closeChatroomModal = closeChatroomModal
window.sendMessage = sendMessage
