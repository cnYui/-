import { apiFormRequest, apiJsonRequest } from './utils/api.js'
import { getAuthUserId } from './utils/auth.js'
import { hideLoading, showLoading, showToast } from './utils/helpers.js'
import { getCachedUser, saveCachedUser } from './utils/user-cache.js'

let uploadedAvatarUrl = null
let currentUser = null

function getCurrentUserId() {
  return getAuthUserId()
}

function getDisplayAvatar(url) {
  if (!url) return 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
  return url.startsWith('/') ? `${window.location.origin}${url}` : url
}

async function loadUserInfo() {
  try {
    const userId = getCurrentUserId()
    if (!userId) {
      showToast('请先登录', 'error')
      setTimeout(() => {
        window.location.href = '/pages/mobile/login.html'
      }, 1000)
      return
    }

    showLoading('加载中...')
    const response = await apiRequest(`/users/${userId}`)
    hideLoading()

    if (response.success) {
      currentUser = response.data
      saveCachedUser(currentUser)

      document.getElementById('avatarPreview').src = getDisplayAvatar(currentUser.avatar)
      document.getElementById('nicknameInput').value = currentUser.nickname || ''
      document.getElementById('bioInput').value = currentUser.bio || ''
      updateCharCount('nickname')
      updateCharCount('bio')
    } else {
      showToast(`加载失败: ${response.error}`, 'error')
    }
  } catch (error) {
    hideLoading()
    console.error('加载用户信息失败:', error)
    showToast('加载失败，请重试', 'error')
  }
}

async function handleAvatarChange(event) {
  const file = event.target.files[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error')
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过5MB', 'error')
    return
  }

  try {
    showLoading('上传中...')
    const formData = new FormData()
    formData.append('image', file)

    const result = await apiFormRequest('/upload/image', {
      method: 'POST',
      formData
    })
    hideLoading()

    if (result.success) {
      uploadedAvatarUrl = result.data.url
      document.getElementById('avatarPreview').src = getDisplayAvatar(uploadedAvatarUrl)
      showToast('头像上传成功', 'success')
    } else {
      showToast(`上传失败: ${result.error}`, 'error')
    }
  } catch (error) {
    hideLoading()
    console.error('上传头像失败:', error)
    showToast('上传失败，请重试', 'error')
  }
}

function updateCharCount(type) {
  if (type === 'nickname') {
    const input = document.getElementById('nicknameInput')
    const count = document.getElementById('nicknameCount')
    count.textContent = input.value.length
  } else if (type === 'bio') {
    const input = document.getElementById('bioInput')
    const count = document.getElementById('bioCount')
    count.textContent = input.value.length
  }
}

async function checkNicknameAvailability(nickname) {
  const query = new URLSearchParams({ nickname })
  const response = await apiRequest(`/users/nickname-availability/check?${query.toString()}`)
  return Boolean(response?.success && response?.data?.available)
}

async function saveProfile() {
  try {
    const userId = getCurrentUserId()
    if (!userId) {
      showToast('请先登录', 'error')
      return
    }

    const nickname = document.getElementById('nicknameInput').value.trim()
    const bio = document.getElementById('bioInput').value.trim()

    if (!nickname) {
      showToast('昵称不能为空', 'error')
      return
    }

    const cachedUser = getCachedUser()
    const nicknameChanged = nickname !== (cachedUser?.nickname || currentUser?.nickname || '')
    if (nicknameChanged) {
      const isAvailable = await checkNicknameAvailability(nickname)
      if (!isAvailable) {
        showToast('昵称已存在，请更换其他昵称', 'error')
        return
      }
    }

    showLoading('保存中...')

    const updateData = {
      nickname,
      bio
    }

    if (uploadedAvatarUrl) {
      updateData.avatar = uploadedAvatarUrl
    }

    const response = await apiJsonRequest(`/users/${userId}`, {
      method: 'PUT',
      body: updateData
    })
    hideLoading()

    if (response.success) {
      saveCachedUser({ ...(cachedUser || currentUser || {}), ...response.data })
      showToast('保存成功', 'success')
      setTimeout(() => {
        window.location.href = '/pages/mobile/profile.html'
      }, 1000)
    } else {
      showToast(`保存失败: ${response.error}`, 'error')
    }
  } catch (error) {
    hideLoading()
    console.error('保存资料失败:', error)
    showToast(error.message || '保存失败，请重试', 'error')
  }
}

function goBack() {
  window.location.href = '/pages/mobile/profile.html'
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('nicknameInput')?.addEventListener('input', () => updateCharCount('nickname'))
  document.getElementById('bioInput')?.addEventListener('input', () => updateCharCount('bio'))
  document.getElementById('avatarInput')?.addEventListener('change', handleAvatarChange)
  await loadUserInfo()
})

window.saveProfile = saveProfile
window.goBack = goBack
