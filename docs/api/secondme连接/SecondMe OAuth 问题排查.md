# SecondMe OAuth 问题排查

## 🐛 问题描述

当点击"连接 SecondMe"按钮时：
1. 浏览器报错：`Failed to launch 'mebot://open/oauth?...' because the scheme does not have a registered handler`
2. 浏览器下载了 SecondMe APK 安装包
3. OAuth 授权流程无法正常完成

## 🔍 问题分析

`https://go.second.me/oauth/` 会检测访问设备：
- **移动设备**：尝试打开 `mebot://` 协议唤起 SecondMe App，或提供 APK 下载
- **桌面设备**：应该显示 Web 授权页面

当前在桌面浏览器中访问时，仍然触发了移动端逻辑，导致错误。

## 🔧 解决方案

### 方案 1：使用新窗口打开（已实施）
```javascript
const authWindow = window.open(authUrl, 'secondme_oauth', 'width=500,height=700');
```

### 方案 2：添加平台参数（待测试）
尝试添加 `platform=web` 或类似参数：
```javascript
const params = new URLSearchParams({
    client_id: SECONDME_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state,
    scope: 'user.info user.info.shades user.info.softmemory',
    platform: 'web' // 或 display: 'page'
});
```

### 方案 3：检查 User-Agent
SecondMe 可能通过 User-Agent 判断设备类型。确保浏览器使用标准桌面 User-Agent。

### 方案 4：联系 SecondMe 技术支持
如果以上方案都无效，可能需要：
1. 检查 SecondMe 开发者控制台的应用配置
2. 确认应用类型是否设置为"Web 应用"
3. 联系 SecondMe 技术支持获取桌面浏览器授权的正确方式

## 📝 测试步骤

1. 清除浏览器缓存和 LocalStorage
2. 访问 profile.html
3. 点击"连接 SecondMe"
4. 观察：
   - 是否打开新窗口
   - 新窗口是否显示 Web 授权页面
   - 是否仍然尝试下载 APK

## 🔗 参考资料

- SecondMe OAuth2 集成指南：docs/api/secondme连接/OAuth2 集成指南.md
- SecondMe OAuth2 API 参考：docs/api/secondme连接/OAuth2 API 参考.md
- 原始项目实现：agenTravel/src/frontend/js/agent-travel-services.js
