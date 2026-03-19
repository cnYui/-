# 反向代理配置

本目录存放反向代理相关配置文件。

## 文件说明

- `nginx.conf` - Nginx 配置示例

## 使用方式

### 开发环境

开发环境通过 Vite 的 proxy 功能代理 API 请求，无需额外配置。

### 生产环境

1. 构建前端：`npm run build`
2. 启动后端：`npm run start`
3. 配置 Nginx 并启动：
   ```bash
   # 复制配置到 Nginx 配置目录
   cp nginx.conf /etc/nginx/sites-available/mingri-lvtu
   ln -s /etc/nginx/sites-available/mingri-lvtu /etc/nginx/sites-enabled/
   nginx -t && nginx -s reload
   ```
