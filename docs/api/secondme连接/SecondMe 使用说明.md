# SecondMe 使用说明

## ✅ 正常使用方式

### 桌面浏览器
在标准桌面浏览器中访问应用：
```
http://localhost:5173/pages/mobile/profile.html
```

点击"连接 SecondMe"即可正常授权。

## ⚠️ 已知限制

### Chrome DevTools 设备模拟模式
**问题：** 当使用 Chrome DevTools 的设备模拟模式（移动设备视图）时，SecondMe 授权页面会尝试唤起移动应用协议 `mebot://`，导致授权失败。

**原因：** SecondMe 的授权页面 `https://go.second.me/oauth/` 会检测访问设备类型：
- **移动设备/模拟器**：尝试打开 SecondMe App 或提供 APK 下载
- **桌面浏览器**：显示 Web 授权页面

**解决方案：**
1. 关闭 Chrome DevTools 的设备工具栏（Toggle Device Toolbar）
2. 使用正常桌面浏览器窗口访问
3. 如果已打开 DevTools，确保视口宽度 ≥ 768px

### 自动检测
应用已添加自动检测：当视口宽度 < 768px 时，点击"连接 SecondMe"会显示提示：
```
⚠️ SecondMe 授权需要在桌面模式下进行

请关闭 Chrome DevTools 的设备模拟模式，或使用桌面浏览器访问。
```

## 📱 移动端使用

如果需要在真实移动设备上使用 SecondMe：
1. 确保已安装 SecondMe App
2. 访问应用时会自动唤起 SecondMe App 进行授权
3. 授权完成后会返回浏览器

## 🔧 开发调试

### 测试 OAuth 流程
1. 使用桌面浏览器（不开启设备模拟）
2. 访问 profile.html
3. 点击"连接 SecondMe"
4. 在新页面完成授权
5. 自动跳转回应用并完成 Token 交换

### 查看授权状态
打开浏览器控制台，查看 localStorage：
```javascript
localStorage.getItem('secondme_access_token')
localStorage.getItem('secondme_user_info')
```

### 清除授权状态
```javascript
localStorage.removeItem('secondme_access_token')
localStorage.removeItem('secondme_refresh_token')
localStorage.removeItem('secondme_token_expires_at')
localStorage.removeItem('secondme_user_info')
```

## 🎯 最佳实践

1. **开发时**：使用桌面浏览器窗口，不启用设备模拟
2. **调试 UI**：如需调试移动端 UI，可以调整浏览器窗口大小，但不要使用 DevTools 的设备模拟
3. **测试 OAuth**：始终在桌面模式下测试 SecondMe 授权流程
4. **真机测试**：在真实移动设备上测试完整的移动端体验

## 📊 技术细节

### 设备检测逻辑
```javascript
if (window.innerWidth < 768) {
    // 显示提示，阻止授权
    alert('请使用桌面模式');
    return;
}
// 继续 OAuth 流程
SecondMeService.initiateLogin();
```

### SecondMe 授权页面行为
- **User-Agent 检测**：识别移动设备 UA
- **视口大小检测**：检测屏幕宽度
- **自动跳转**：移动设备 → `mebot://` 协议，桌面 → Web 授权页面

## 🆘 常见问题

### Q: 为什么会下载 APK？
A: SecondMe 检测到移动设备访问时，会提供 App 下载。请使用桌面浏览器。

### Q: 如何在移动端调试 UI？
A: 调整浏览器窗口大小即可，不要使用 DevTools 设备模拟。

### Q: 真实手机上能用吗？
A: 可以，但需要安装 SecondMe App。授权时会自动唤起 App。

### Q: 为什么原始项目没这个问题？
A: 原始项目也有同样的限制，只是可能在开发时没有使用设备模拟模式。
