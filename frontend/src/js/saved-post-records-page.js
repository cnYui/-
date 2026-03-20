import { apiJsonRequest, apiRequest } from './utils/api.js'
import { getAuthUserId } from './utils/auth.js'
import { escapeHtml, formatRelativeTime, hideLoading, showLoading, showToast } from './utils/helpers.js'

let records = []
let activeRecordId = null

function getStatusMeta(status) {
  if (status === 'success') return { text: 'AI图已生成', color: '#166534', bg: '#dcfce7' }
  if (status === 'failed') return { text: '生成失败', color: '#b91c1c', bg: '#fee2e2' }
  if (status === 'processing') return { text: '生成中', color: '#1d4ed8', bg: '#dbeafe' }
  return { text: '待生成', color: '#92400e', bg: '#fef3c7' }
}

function getDisplayImage(record) {
  return record.generatedImageUrl || record.originalImageUrl || ''
}

function formatVisitTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function upsertRecord(record) {
  const index = records.findIndex((item) => item.id == record.id)
  if (index >= 0) {
    records[index] = record
  } else {
    records.unshift(record)
  }
}

function renderEmptyState(message = '还没有保存记录') {
  const container = document.getElementById('recordsList')
  if (!container) return
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="ri-folder-open-line"></i></div>
      <div class="empty-title">${escapeHtml(message)}</div>
      <div class="empty-desc">你可以先保存多条帖子，再逐条挑选喜欢的电影风格去生成 AI 图片。</div>
    </div>
  `
}

function renderRecordItem(record) {
  const status = getStatusMeta(record.generationStatus)
  const imageUrl = getDisplayImage(record)
  const movieText = record.movieName ? `电影：${record.movieName}` : '还没选择电影风格'
  return `
    <article class="record-row" onclick="openSavedRecordDetail(${record.id})">
      <div class="record-thumb-box">
        ${imageUrl
          ? `<img class="record-thumb" src="${escapeHtml(imageUrl)}" alt="保存记录图片">`
          : `<div class="record-thumb record-thumb-empty"><i class="ri-image-line"></i></div>`}
      </div>
      <div class="record-main">
        <div class="record-topline">
          <div class="record-title">${escapeHtml(record.title || '未命名记录')}</div>
          <span class="record-status" style="background:${status.bg}; color:${status.color};">${status.text}</span>
        </div>
        <div class="record-meta">${escapeHtml(record.locationName || record.city || '未知地点')} · ${escapeHtml(record.mood || '未设置')}</div>
        <div class="record-text">${escapeHtml((record.content || '').slice(0, 46))}${(record.content || '').length > 46 ? '...' : ''}</div>
        <div class="record-bottomline">
          <span>${escapeHtml(movieText)}</span>
          <span>${formatRelativeTime(record.updatedAt || record.createdAt)}</span>
        </div>
      </div>
    </article>
  `
}

function renderRecords() {
  const container = document.getElementById('recordsList')
  if (!container) return

  if (!records.length) {
    renderEmptyState()
    return
  }

  container.innerHTML = records.map(renderRecordItem).join('')
}

async function loadRecords() {
  console.log('🔄 开始加载保存记录...')
  const userId = getAuthUserId()
  console.log('  当前用户ID:', userId)
  
  if (!userId) {
    console.log('  ❌ 未登录，跳转到登录页')
    window.location.href = '/pages/mobile/login.html'
    return
  }

  const container = document.getElementById('recordsList')
  if (container) {
    container.innerHTML = '<div class="loading-state"><i class="ri-loader-4-line spin"></i><p>正在加载保存记录...</p></div>'
  }

  try {
    console.log('  📤 发送API请求: GET /api/saved-post-records')
    const result = await apiRequest('/saved-post-records')
    console.log('  📥 收到响应:', result)
    
    if (!result?.success) {
      throw new Error(result?.error || '加载失败')
    }
    
    records = result.data || []
    console.log(`  ✅ 加载成功，共 ${records.length} 条记录`)
    records.forEach(r => {
      console.log(`    - ID: ${r.id}, 标题: ${r.title}, 状态: ${r.generationStatus}`)
    })
    
    renderRecords()
  } catch (error) {
    console.error('❌ 加载保存记录失败:', error)
    renderEmptyState('加载失败，请稍后重试')
  }
}

function closeDetailModal() {
  const modal = document.getElementById('savedRecordDetailModal')
  if (modal) {
    modal.remove()
  }
  activeRecordId = null
}

function renderStyleAnalysis(styleAnalysis) {
  if (!styleAnalysis) return ''
  return `
    <div class="detail-analysis-box">
      <div class="detail-section-title">电影风格分析</div>
      <div class="detail-analysis-grid">
        <div><span class="detail-label">风格</span><span>${escapeHtml(styleAnalysis.movie_style || '未生成')}</span></div>
        <div><span class="detail-label">情绪</span><span>${escapeHtml(styleAnalysis.movie_emotion || '未生成')}</span></div>
        <div><span class="detail-label">色调</span><span>${escapeHtml(styleAnalysis.color_tone || '未生成')}</span></div>
        <div><span class="detail-label">滤镜</span><span>${escapeHtml(styleAnalysis.filter_effect || '未生成')}</span></div>
      </div>
    </div>
  `
}

function renderDetailModal(record) {
  closeDetailModal()
  activeRecordId = record.id

  const status = getStatusMeta(record.generationStatus)
  const imageUrl = getDisplayImage(record)
  const publishedTag = record.publishedPostId
    ? '<span class="detail-tag detail-tag-published">已发布</span>'
    : '<span class="detail-tag">未发布</span>'

  const modal = document.createElement('div')
  modal.id = 'savedRecordDetailModal'
  modal.className = 'detail-modal-overlay'
  modal.innerHTML = `
    <div class="detail-modal-card">
      <div class="detail-header">
        <div>
          <div class="detail-title-row">
            <h2>${escapeHtml(record.title || '保存记录')}</h2>
            ${publishedTag}
          </div>
          <p>${escapeHtml(record.locationName || record.city || '未知地点')} · ${escapeHtml(record.mood || '未设置')}</p>
        </div>
        <button class="detail-close-btn" onclick="closeSavedRecordDetail()"><i class="ri-close-line"></i></button>
      </div>
      <div class="detail-body">
        <div class="detail-preview-wrap">
          ${imageUrl ? `<img class="detail-image" src="${escapeHtml(imageUrl)}" alt="记录图片">` : '<div class="detail-image detail-image-empty"><i class="ri-image-line"></i></div>'}
        </div>
        <div class="detail-status-row">
          <div class="detail-status" style="background:${status.bg}; color:${status.color};">${status.text}</div>
          ${record.movieName ? `<div class="detail-status detail-movie-tag">当前电影：${escapeHtml(record.movieName)}</div>` : ''}
        </div>
        ${record.generationError ? `<div class="detail-error">${escapeHtml(record.generationError)}</div>` : ''}

        <div class="detail-generate-box">
          <div class="detail-section-title">电影风格改写</div>
          <div class="detail-generate-row">
            <input class="detail-movie-input" id="recordMovieInput" type="text" value="${escapeHtml(record.movieName || '')}" placeholder="例如：疯狂动物城、重庆森林、长安三万里">
            <button class="detail-generate-btn" onclick="generateSavedRecordImage(${record.id})">
              <i class="ri-magic-line"></i> AI生成图片
            </button>
          </div>
          <div class="detail-helper-text">系统会先分析电影风格，再结合这条记录和原图做电影感改写。</div>
        </div>

        ${renderStyleAnalysis(record.styleAnalysis)}

        <div class="detail-section">
          <div class="detail-label">正文</div>
          <div class="detail-content">${escapeHtml(record.content || '（无内容）')}</div>
        </div>

        <div class="detail-grid">
          <div><span class="detail-label">访问时间</span><span>${formatVisitTime(record.visitTime)}</span></div>
          <div><span class="detail-label">保存时间</span><span>${formatVisitTime(record.createdAt)}</span></div>
        </div>

        <div class="detail-actions">
          <button class="action-btn action-btn-delete" onclick="deleteSavedRecord(${record.id})">
            <i class="ri-delete-bin-line"></i> 删除
          </button>
          <button class="action-btn action-btn-publish" onclick="publishSavedRecord(${record.id})" ${record.publishedPostId ? 'disabled' : ''}>
            <i class="ri-send-plane-fill"></i> ${record.publishedPostId ? '已发布' : '正式发布'}
          </button>
        </div>
      </div>
    </div>
  `

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeDetailModal()
    }
  })

  document.body.appendChild(modal)
}

async function refreshRecordAndOpen(recordId) {
  const result = await apiRequest(`/saved-post-records/${recordId}`)
  if (!result?.success) {
    throw new Error(result?.error || '获取详情失败')
  }
  upsertRecord(result.data)
  renderRecords()
  renderDetailModal(result.data)
}

async function openSavedRecordDetail(recordId) {
  try {
    await refreshRecordAndOpen(recordId)
  } catch (error) {
    console.error('❌ 获取保存记录详情失败:', error)
    showToast('获取详情失败: ' + error.message, 'error')
  }
}

async function generateSavedRecordImage(recordId) {
  const movieName = document.getElementById('recordMovieInput')?.value?.trim() || ''
  if (!movieName) {
    showToast('请输入喜欢的电影名称', 'error')
    return
  }

  try {
    showLoading('正在分析电影风格并生成 AI 图片...')
    const result = await apiJsonRequest(`/saved-post-records/${recordId}/generate-image`, {
      method: 'POST',
      body: { movieName }
    })

    hideLoading()

    if (!result?.success) {
      if (result?.data) {
        upsertRecord(result.data)
        renderRecords()
        renderDetailModal(result.data)
      }
      throw new Error(result?.error || 'AI 生成失败')
    }

    upsertRecord(result.data)
    renderRecords()
    renderDetailModal(result.data)
    showToast('AI 图片生成成功，已替换为新的电影风格图片', 'success')
  } catch (error) {
    hideLoading()
    console.error('❌ AI 图片生成失败:', error)
    showToast('AI 图片生成失败: ' + error.message, 'error')
  }
}

async function publishSavedRecord(recordId) {
  console.log('🚀 开始发布记录:', recordId, '类型:', typeof recordId)
  console.log('  当前records数组:', records)
  console.log('  records数组长度:', records.length)
  console.log('  records数组内容:', records.map(r => ({ id: r.id, idType: typeof r.id, title: r.title })))
  
  // 使用宽松相等来比较，避免类型不匹配问题
  const record = records.find((item) => item.id == recordId)
  console.log('  查找结果:', record)
  
  if (!record) {
    console.error('❌ 找不到记录:', recordId)
    console.error('  可用的记录ID:', records.map(r => r.id))
    showToast('找不到该记录，请刷新页面重试', 'error')
    return
  }

  if (record.publishedPostId) {
    console.log('ℹ️  记录已发布过:', record.publishedPostId)
    showToast('该记录已经发布过了', 'info')
    return
  }

  try {
    console.log('📤 发送发布请求...')
    showLoading('正在正式发布记录...')
    const result = await apiJsonRequest(`/saved-post-records/${recordId}/publish`, {
      method: 'POST'
    })
    console.log('📥 收到响应:', result)

    if (!result?.success) {
      console.error('❌ 发布失败:', result?.error)
      throw new Error(result?.error || '发布失败')
    }

    console.log('✅ 发布成功，帖子数据:', result.data?.post)

    const post = result.data?.post
    if (post?.id) {
      console.log('🏠 创建聊天室...')
      console.log('  帖子ID:', post.id)
      console.log('  城市:', post.city)
      console.log('  区县:', post.district)
      console.log('  地点:', post.locationName)
      console.log('  坐标:', post.lat, post.lng)
      
      const chatroomResult = await apiJsonRequest('/chatrooms/create-by-location', {
        method: 'POST',
        body: {
          postId: post.id,
          city: post.city,
          district: post.district,
          lat: post.lat,
          lng: post.lng,
          radius: 1000
        }
      })
      
      console.log('✅ 聊天室创建成功:', chatroomResult)
      if (chatroomResult?.data) {
        console.log('  聊天室ID:', chatroomResult.data.chatroomId)
        console.log('  聊天室名称:', chatroomResult.data.chatroomName)
        console.log('  匹配用户数:', chatroomResult.data.matchedUsers?.length || 0)
        console.log('  是否复用:', chatroomResult.data.isReused)
        console.log('  匹配用户列表:', chatroomResult.data.matchedUsers)
        
        // 如果需要生成AI对话，调用流式生成接口
        if (chatroomResult.data.needsGeneration && chatroomResult.data.chatroomId) {
          const matchCount = chatroomResult.data.matchedUsers?.length || 0
          console.log('🤖 开始流式生成AI群聊...')
          generateChatroomStreamInBackground(chatroomResult.data.chatroomId, matchCount > 0 ? 6 : 1)
        }
      }
    }

    hideLoading()
    console.log('✅ 发布流程完成，准备跳转到主页')
    showToast('发布成功！正在返回主页...', 'success')
    
    // 延迟一下让用户看到成功提示
    setTimeout(() => {
      console.log('🔄 开始跳转到 notes.html')
      window.location.href = '/pages/mobile/notes.html'
    }, 800)
  } catch (error) {
    hideLoading()
    console.error('❌ 发布保存记录失败:', error)
    showToast('发布失败: ' + error.message, 'error')
  }
}

/**
 * 后台流式生成聊天室AI对话（不阻塞页面跳转）
 */
function generateChatroomStreamInBackground(chatroomId, maxMessages = 6) {
  const userId = getAuthUserId()
  if (!userId) return
  
  console.log(`  📡 后台调用流式生成: chatroomId=${chatroomId}, maxMessages=${maxMessages}`)
  
  fetch(`/api/chatrooms/${chatroomId}/generate-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify({ maxMessages })
  }).then(response => {
    if (!response.ok) {
      throw new Error('流式生成请求失败')
    }
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let messageCount = 0
    
    function readStream() {
      reader.read().then(({ done, value }) => {
        if (done) {
          console.log('  ✅ 后台流式生成完成')
          return
        }
        
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              
              switch (data.type) {
                case 'start':
                  console.log(`  🎬 开始生成: 成员数=${data.memberCount}`)
                  break
                case 'message':
                  messageCount++
                  console.log(`  💬 消息${messageCount}: ${data.nickname}`)
                  break
                case 'done':
                  console.log(`  ✅ 生成完成: 共${data.totalMessages}条消息`)
                  break
                case 'error':
                  console.error('  ❌ 生成错误:', data.message)
                  break
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
        
        readStream()
      }).catch(error => {
        console.error('  ❌ 读取流失败:', error)
      })
    }
    
    readStream()
  }).catch(error => {
    console.error('❌ 后台流式生成失败:', error)
  })
}

async function deleteSavedRecord(recordId) {
  if (!window.confirm('确定删除这条保存记录吗？')) {
    return
  }

  try {
    showLoading('正在删除记录...')
    const result = await apiJsonRequest(`/saved-post-records/${recordId}`, {
      method: 'DELETE'
    })

    hideLoading()
    if (!result?.success) {
      throw new Error(result?.error || '删除失败')
    }

    closeDetailModal()
    await loadRecords()
    showToast('记录已删除', 'success')
  } catch (error) {
    hideLoading()
    console.error('❌ 删除保存记录失败:', error)
    showToast('删除失败: ' + error.message, 'error')
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadRecords()
})

window.openSavedRecordDetail = openSavedRecordDetail
window.closeSavedRecordDetail = closeDetailModal
window.generateSavedRecordImage = generateSavedRecordImage
window.publishSavedRecord = publishSavedRecord
window.deleteSavedRecord = deleteSavedRecord
