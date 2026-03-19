// ============================================================
// 明日旅途 Services - 核心服务层
// 包含：SecondMe OAuth、DeepSeek AI、记忆管理、存储
// ============================================================

import { getAuthUserId } from './utils/auth.js';
import { showToast } from './utils/helpers.js';
import { saveCachedUser } from './utils/user-cache.js';

// ------ API 配置 ------
const API_BASE = '/api';
// 使用 Web 版本授权页面，避免移动应用协议问题
const SECONDME_OAUTH_URL = 'https://go.second.me/oauth/';
const SECONDME_CLIENT_ID = '1fd10355-ad04-43b1-a479-5a868b505130';

// ------ SecondMe Service ------
const SecondMeService = {
    getCurrentUserId() {
        return getAuthUserId();
    },

    getScopedKey(baseKey) {
        const userId = this.getCurrentUserId();
        return userId ? `${baseKey}_${userId}` : baseKey;
    },

    generateState() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    getRedirectUri() {
        const port = window.location.port || '80';
        const host = window.location.hostname;
        // 固定回调到 SecondMe 记忆页面
        return `http://${host}:${port}/pages/mobile/secondme-memories.html`;
    },

    initiateLogin() {
        const state = this.generateState();
        sessionStorage.setItem(this.getScopedKey('secondme_oauth_state'), state);
        const redirectUri = this.getRedirectUri();
        console.log('🔗 SecondMe OAuth redirect_uri:', redirectUri);
        
        const params = new URLSearchParams({
            client_id: SECONDME_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            state: state,
            scope: 'user.info user.info.shades user.info.softmemory',
        });
        
        const authUrl = `${SECONDME_OAUTH_URL}?${params.toString()}`;
        console.log('🚀 SecondMe OAuth URL:', authUrl);
        console.log('📱 如果出现下载提示，请在桌面浏览器中访问');
        
        // 直接跳转到授权页面（与原始项目一致）
        window.location.href = authUrl;
    },

    async handleCallback(code) {
        const response = await fetch(`${API_BASE}/secondme/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                redirect_uri: this.getRedirectUri(),
            }),
        });
        const result = await response.json();
        if (result.code !== 0 || !result.data) {
            throw new Error(`Token exchange failed: ${result.message || 'Unknown error'}`);
        }
        const tokenData = result.data;
        localStorage.setItem(this.getScopedKey('secondme_access_token'), tokenData.accessToken);
        localStorage.setItem(this.getScopedKey('secondme_refresh_token'), tokenData.refreshToken);
        localStorage.setItem(this.getScopedKey('secondme_token_expires_at'), String(Date.now() + tokenData.expiresIn * 1000));
        return tokenData;
    },

    async refreshToken() {
        const refreshToken = localStorage.getItem(this.getScopedKey('secondme_refresh_token'));
        if (!refreshToken) throw new Error('No refresh token available');
        
        const response = await fetch(`${API_BASE}/secondme/oauth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                refresh_token: refreshToken,
            }),
        });
        const result = await response.json();
        if (result.code !== 0 || !result.data) {
            this.clearAuth();
            throw new Error(`Token refresh failed: ${result.message || 'Unknown error'}`);
        }
        const tokenData = result.data;
        localStorage.setItem(this.getScopedKey('secondme_access_token'), tokenData.accessToken);
        localStorage.setItem(this.getScopedKey('secondme_refresh_token'), tokenData.refreshToken);
        localStorage.setItem(this.getScopedKey('secondme_token_expires_at'), String(Date.now() + tokenData.expiresIn * 1000));
        return tokenData;
    },

    async getValidAccessToken() {
        const accessToken = localStorage.getItem(this.getScopedKey('secondme_access_token'));
        const expiresAt = localStorage.getItem(this.getScopedKey('secondme_token_expires_at'));
        if (!accessToken) return null;
        
        // 如果 token 即将过期（5分钟内），刷新它
        if (expiresAt && Date.now() > Number(expiresAt) - 5 * 60 * 1000) {
            try {
                const newToken = await this.refreshToken();
                return newToken.accessToken;
            } catch (error) {
                return null;
            }
        }
        return accessToken;
    },

    async getUserInfo() {
        const token = await this.getValidAccessToken();
        if (!token) return null;
        try {
            const response = await fetch(`${API_BASE}/secondme/user/info`, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
            });
            const result = await response.json();
            if (result.code !== 0 || !result.data) return null;
            
            // 保存用户信息
            localStorage.setItem(this.getScopedKey('secondme_user_info'), JSON.stringify(result.data));
            return result.data;
        } catch (error) {
            console.error('Failed to get SecondMe user info:', error);
            return null;
        }
    },

    getCachedUserInfo() {
        try {
            const raw = localStorage.getItem(this.getScopedKey('secondme_user_info'));
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    async getSoftMemories() {
        const token = await this.getValidAccessToken();
        if (!token) throw new Error('未登录 SecondMe');
        
        try {
            const response = await fetch(`${API_BASE}/secondme/softmemory?pageNo=1&pageSize=200`, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
            });
            const result = await response.json();
            if (result.code === 0 && result.data) {
                return result.data.list || [];
            }
            throw new Error(result.message || '获取记忆失败');
        } catch (error) {
            console.error('获取 SecondMe 记忆失败:', error);
            throw error;
        }
    },

    async getSoftMemory(keyword = '', pageNo = 1, pageSize = 200) {
        const token = await this.getValidAccessToken();
        if (!token) return { list: [], total: 0 };
        try {
            const params = new URLSearchParams();
            if (keyword) params.append('keyword', keyword);
            params.append('pageNo', String(pageNo));
            params.append('pageSize', String(pageSize));
            
            const response = await fetch(`${API_BASE}/secondme/softmemory?${params.toString()}`, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
            });
            const result = await response.json();
            if (result.code === 0 && result.data) {
                return { list: result.data.list || [], total: result.data.total || 0 };
            }
            return { list: [], total: 0 };
        } catch (error) {
            console.error('Failed to get SecondMe soft memory:', error);
            return { list: [], total: 0 };
        }
    },

    isLoggedIn() {
        return !!localStorage.getItem(this.getScopedKey('secondme_access_token'));
    },

    clearAuth() {
        localStorage.removeItem(this.getScopedKey('secondme_access_token'));
        localStorage.removeItem(this.getScopedKey('secondme_refresh_token'));
        localStorage.removeItem(this.getScopedKey('secondme_token_expires_at'));
        localStorage.removeItem(this.getScopedKey('secondme_user_info'));
        sessionStorage.removeItem(this.getScopedKey('secondme_oauth_state'));
    },

    logout() {
        this.clearAuth();
        localStorage.removeItem(this.getScopedKey('secondme-memories'));
        console.log('✅ SecondMe 退出登录，已清除所有用户数据');
        window.location.reload();
    }
};

// ------ Memory API ------
const MemoryAPI = {
    // 获取用户的所有记忆
    async getUserMemories(userId) {
        const response = await fetch(`${API_BASE}/memories/user/${userId}`);
        return response.json();
    },

    // 创建单个记忆
    async createMemory(category, title, content) {
        const response = await fetch(`${API_BASE}/memories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, title, content })
        });
        return response.json();
    },

    // 批量创建记忆
    async createMemories(memories) {
        const response = await fetch(`${API_BASE}/memories/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memories })
        });
        return response.json();
    },

    // 追加内容到现有记忆
    async appendToMemory(memoryId, content) {
        const response = await fetch(`${API_BASE}/memories/${memoryId}/append`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        return response.json();
    },

    // 删除记忆
    async deleteMemory(memoryId) {
        const response = await fetch(`${API_BASE}/memories/${memoryId}`, {
            method: 'DELETE'
        });
        return response.json();
    },

    // AI 分类记忆
    async classifyMemory(content) {
        const response = await fetch(`${API_BASE}/memories/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        return response.json();
    }
};

// ------ Storage Helper ------
const Storage = {
    getSecondMeMemories() { 
        try { 
            return JSON.parse(localStorage.getItem(SecondMeService.getScopedKey('secondme-memories')) || '[]'); 
        } catch { 
            return []; 
        } 
    },
    saveSecondMeMemories(memories) { 
        localStorage.setItem(SecondMeService.getScopedKey('secondme-memories'), JSON.stringify(memories)); 
    },
    getUserId() { 
        return SecondMeService.getCurrentUserId(); 
    },
    setUserId(id) {
        saveCachedUser({ id });
    }
};

// ------ 检查 OAuth 回调 ------
function checkOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code) {
        const savedState = sessionStorage.getItem(SecondMeService.getScopedKey('secondme_oauth_state'));
        if (state && state === savedState) {
            console.log('🔐 检测到 OAuth 回调，正在处理...');
            
            // 清除 URL 参数
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            
            // 处理回调
            SecondMeService.handleCallback(code)
                .then(async () => {
                    console.log('✅ SecondMe 登录成功');
                    // 获取用户信息
                    await SecondMeService.getUserInfo();
                    // 刷新页面状态
                    if (typeof refreshSecondMeStatus === 'function') {
                        refreshSecondMeStatus();
                    } else {
                        window.location.reload();
                    }
                })
                .catch(error => {
                    console.error('❌ SecondMe 登录失败:', error);
                    showToast('SecondMe 登录失败: ' + error.message, 'error');
                });
        }
    }
}

window.SecondMeService = SecondMeService;
window.MemoryAPI = MemoryAPI;
window.Storage = Storage;

// 页面加载时检查 OAuth 回调
document.addEventListener('DOMContentLoaded', checkOAuthCallback);
