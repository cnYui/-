# SecondMe OAuth2 配置说明

## 📋 OAuth2 凭据信息

```
Client ID: 1fd10355-ad04-43b1-a479-5a868b505130
Client Secret: 4144a38a22f1b03390973b337797fe673e0957d7726b7ccef9f7321fe72c92a4
```

## 🔗 回调地址配置

在 SecondMe 开发者控制台的 **Redirect URIs** 中，需要填写以下地址：

### 本地开发环境
```
http://localhost:5173/pages/mobile/profile.html
```

### 生产环境（根据实际部署域名修改）
```
https://your-domain.com/pages/mobile/profile.html
```

**重要说明：**
- 回调地址必须与前端代码中的 `redirect_uri` 完全一致
- 支持配置多个回调地址（每行一个）
- HTTP 仅用于本地开发，生产环境必须使用 HTTPS

## 📝 OAuth2 授权流程

### 1. 授权 URL 格式
```
https://go.second.me/oauth/?client_id=1fd10355-ad04-43b1-a479-5a868b505130&redirect_uri=http://localhost:5173/pages/mobile/profile.html&response_type=code&state=RANDOM_STATE&scope=user.info user.info.shades user.info.softmemory
```

### 2. 回调 URL 格式
用户授权后，SecondMe 会重定向回：
```
http://localhost:5173/pages/mobile/profile.html?code=lba_ac_xxxxx&state=RANDOM_STATE
```

### 3. Token 交换
前端收到 code 后，调用后端 API：
```
POST /api/secondme/oauth/token
Content-Type: application/json

{
  "code": "lba_ac_xxxxx",
  "redirect_uri": "http://localhost:5173/pages/mobile/profile.html"
}
```

### 4. 后端调用 SecondMe API
```
POST https://api.mindverse.com/gate/lab/api/oauth/token/code
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
code=lba_ac_xxxxx
redirect_uri=http://localhost:5173/pages/mobile/profile.html
client_id=1fd10355-ad04-43b1-a479-5a868b505130
client_secret=4144a38a22f1b03390973b337797fe673e0957d7726b7ccef9f7321fe72c92a4
```

## 🎯 权限范围 (Scope)

当前申请的权限：
- `user.info` - 访问用户基础信息
- `user.info.shades` - 访问用户兴趣标签
- `user.info.softmemory` - 访问用户软记忆

## ⏱️ Token 有效期

| Token 类型 | 有效期 |
|-----------|--------|
| Authorization Code | 5 分钟 |
| Access Token | 2 小时 |
| Refresh Token | 30 天 |

## 🔧 前端实现要点

1. **生成并验证 state 参数**
   ```javascript
   const state = Math.random().toString(36).substring(2, 15) + 
                 Math.random().toString(36).substring(2, 15);
   sessionStorage.setItem('secondme_oauth_state', state);
   ```

2. **构建授权 URL**
   ```javascript
   const params = new URLSearchParams({
     client_id: SECONDME_CLIENT_ID,
     redirect_uri: window.location.origin + '/pages/mobile/profile.html',
     response_type: 'code',
     state: state,
     scope: 'user.info user.info.shades user.info.softmemory'
   });
   const authUrl = `https://go.second.me/oauth/?${params.toString()}`;
   window.location.href = authUrl;
   ```

3. **处理回调**
   ```javascript
   const urlParams = new URLSearchParams(window.location.search);
   const code = urlParams.get('code');
   const state = urlParams.get('state');
   const savedState = sessionStorage.getItem('secondme_oauth_state');
   
   if (code && state === savedState) {
     // 验证通过，调用后端换取 token
     const response = await fetch('/api/secondme/oauth/token', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         code: code,
         redirect_uri: window.location.origin + '/pages/mobile/profile.html'
       })
     });
   }
   ```

## 🔐 安全最佳实践

1. **Client Secret 保密**
   - 只在后端使用，不要暴露在前端代码中
   - 使用环境变量存储

2. **验证 State 参数**
   - 防止 CSRF 攻击
   - 每次授权请求使用新的随机值

3. **HTTPS**
   - 生产环境必须使用 HTTPS
   - 保护 Token 传输安全

4. **Token 存储**
   - Access Token 存储在 localStorage
   - 设置合理的过期检查

## 🐛 常见问题

### 1. Redirect URI 不匹配
**错误：** `oauth2.redirect_uri.mismatch`
**解决：** 确保 SecondMe 后台配置的回调地址与代码中使用的完全一致

### 2. Client Secret 错误
**错误：** `oauth2.client.secret_mismatch`
**解决：** 检查后端环境变量中的 Client Secret 是否正确

### 3. Authorization Code 过期
**错误：** `oauth2.code.invalid`
**解决：** Authorization Code 只有 5 分钟有效期，获取后应立即换取 Token

### 4. 请求格式错误
**错误：** `Field required`
**解决：** 后端换取 Token 时必须使用 `application/x-www-form-urlencoded`，不能使用 JSON

## 📱 测试流程

1. 启动后端服务
   ```bash
   cd backend
   npm run dev
   ```

2. 启动前端服务
   ```bash
   cd frontend
   npm run dev
   ```

3. 访问 http://localhost:5173/pages/mobile/profile.html

4. 点击"连接 SecondMe"按钮

5. 在 SecondMe 授权页面登录并授权

6. 授权成功后自动跳转回应用，并完成 Token 交换

7. 查看浏览器控制台和后端日志确认流程正常
