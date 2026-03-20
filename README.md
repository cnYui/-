# 明日旅途 🌏

一个基于地理位置的旅行社交平台，支持发布旅行笔记、AI智能群聊、实时位置分享等功能。

## ✨ 核心功能

- 📍 **地理位置笔记** - 在地图上发布带位置的旅行笔记
- 🤖 **AI智能群聊** - 基于地理位置自动匹配附近旅行者，AI生成真实群聊对话
- 🗺️ **实时地图** - 查看附近的旅行者和热门地点
- 💾 **草稿保存** - 支持保存草稿，稍后发布
- 🎨 **AI图片生成** - 基于电影风格生成旅行图片

## 🏗️ 技术栈

### 前端
- **框架**: Vanilla JavaScript (ES6+)
- **构建工具**: Vite
- **地图**: 高德地图 API
- **UI**: 自定义组件库

### 后端
- **运行时**: Node.js
- **框架**: Express.js
- **数据库**: PostgreSQL (Docker)
- **AI服务**: StepFun API (阶跃星辰)

## 📦 项目结构

```
明日旅途/
├── frontend/              # 前端项目
│   ├── src/
│   │   ├── pages/        # 页面 HTML
│   │   ├── js/           # JavaScript 模块
│   │   ├── styles/       # CSS 样式
│   │   └── assets/       # 静态资源
│   └── package.json
├── backend/              # 后端项目
│   ├── src/
│   │   ├── routes/       # API 路由
│   │   ├── services/     # 业务服务
│   │   ├── database/     # 数据库脚本
│   │   └── middleware/   # 中间件
│   ├── uploads/          # 上传文件目录
│   └── package.json
├── docs/                 # 项目文档
│   ├── api/             # API 文档
│   └── debug/           # 调试文档
└── README.md
```

## 🚀 快速开始

### 1. 环境要求

- Node.js >= 18.0.0
- Docker Desktop (用于运行 PostgreSQL)
- npm 或 yarn
- Git

### 2. 克隆项目

```bash
git clone https://github.com/your-username/mingri-lvtu.git
cd mingri-lvtu
```

### 3. 安装依赖

```bash
# 安装前端依赖
cd frontend
npm install

# 安装后端依赖
cd ../backend
npm install
```

### 4. 数据库配置（重要）

本项目使用 PostgreSQL 数据库，运行在 Docker 容器中。

#### 方法一：使用 Docker Compose（推荐）

```bash
# 在项目根目录执行
docker-compose up -d
```

这会自动创建并启动 PostgreSQL 容器，数据会持久化保存。

#### 方法二：手动启动 Docker 容器

```bash
# 拉取 PostgreSQL 镜像
docker pull postgres:latest

# 启动容器
docker run --name mingri-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mingri_lvtu \
  -e POSTGRES_USER=postgres \
  -p 5432:5432 \
  -v mingri_postgres_data:/var/lib/postgresql/data \
  -d postgres:latest
```

#### 验证数据库是否启动成功

```bash
# 查看容器状态
docker ps | grep mingri-postgres

# 进入数据库
docker exec -it mingri-postgres psql -U postgres -d mingri_lvtu

# 在 psql 中执行
\l              # 查看所有数据库
\q              # 退出
```

### 5. 初始化数据库表结构

```bash
cd backend
node src/database/init.js
```

你应该看到类似输出：
```
✅ PostgreSQL 连接成功
✅ 数据库初始化完成
```

### 6. 配置环境变量

后端的 `.env` 文件已包含在项目中，默认配置如下：

```env
# 数据库配置
DB_CLIENT=postgres
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=mingri_lvtu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# StepFun AI API（需要替换为你的 Key）
STEPFUN_API_KEY=your_api_key_here
```

**重要**：请将 `STEPFUN_API_KEY` 替换为你自己的 API Key。

### 7. 启动项目

```bash
# 启动后端（终端1）
cd backend
npm run dev

# 启动前端（终端2）
cd frontend
npm run dev
```

### 8. 访问应用

- **前端**: http://localhost:5173
- **后端 API**: http://localhost:3001/api

## 🐳 Docker 数据库管理

### 常用命令

```bash
# 启动数据库
docker start mingri-postgres

# 停止数据库
docker stop mingri-postgres

# 重启数据库
docker restart mingri-postgres

# 查看日志
docker logs mingri-postgres

# 查看容器状态
docker ps -a | grep mingri-postgres
```

### 数据库备份与恢复

#### 备份数据库

```bash
# 导出整个数据库
docker exec mingri-postgres pg_dump -U postgres mingri_lvtu > backup_$(date +%Y%m%d).sql

# 导出特定表
docker exec mingri-postgres pg_dump -U postgres -t posts mingri_lvtu > posts_backup.sql
```

#### 恢复数据库

```bash
# 从备份文件恢复
docker exec -i mingri-postgres psql -U postgres mingri_lvtu < backup_20260320.sql
```

### 数据库迁移到新机器

#### 方法一：导出/导入 SQL 文件

```bash
# 在旧机器上导出
docker exec mingri-postgres pg_dump -U postgres mingri_lvtu > mingri_lvtu_export.sql

# 复制 SQL 文件到新机器，然后导入
docker exec -i mingri-postgres psql -U postgres mingri_lvtu < mingri_lvtu_export.sql
```

#### 方法二：使用 Docker Volume

```bash
# 在旧机器上创建备份
docker run --rm \
  -v mingri_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data_backup.tar.gz /data

# 在新机器上恢复
docker run --rm \
  -v mingri_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres_data_backup.tar.gz -C /
```

### 重置数据库

如果需要完全重置数据库：

```bash
# 停止并删除容器
docker stop mingri-postgres
docker rm mingri-postgres

# 删除数据卷（会清空所有数据）
docker volume rm mingri_postgres_data

# 重新启动容器
docker-compose up -d

# 重新初始化表结构
cd backend
node src/database/init.js
```

## 📦 Docker 镜像打包与分发

### 打包整个应用为 Docker 镜像

#### 1. 创建应用 Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
# 前端构建阶段
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 后端构建阶段
FROM node:18-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./

# 最终运行阶段
FROM node:18-alpine
WORKDIR /app

# 复制后端文件
COPY --from=backend-build /app/backend ./backend

# 复制前端构建产物
COPY --from=frontend-build /app/frontend/dist ./backend/public

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["node", "backend/src/index.js"]
```

#### 2. 构建镜像

```bash
# 构建镜像
docker build -t mingri-lvtu:latest .

# 查看镜像
docker images | grep mingri-lvtu
```

#### 3. 运行应用容器

```bash
# 创建网络
docker network create mingri-network

# 启动数据库（如果还没启动）
docker run -d \
  --name mingri-postgres \
  --network mingri-network \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mingri_lvtu \
  -v mingri_postgres_data:/var/lib/postgresql/data \
  postgres:latest

# 启动应用
docker run -d \
  --name mingri-app \
  --network mingri-network \
  -p 3001:3001 \
  -e POSTGRES_HOST=mingri-postgres \
  -e STEPFUN_API_KEY=your_api_key_here \
  mingri-lvtu:latest
```

#### 4. 使用 Docker Compose 一键部署

更新 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:latest
    container_name: mingri-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: mingri_lvtu
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  app:
    build: .
    container_name: mingri-app
    ports:
      - "3001:3001"
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_DB=mingri_lvtu
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - STEPFUN_API_KEY=${STEPFUN_API_KEY}
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

然后一键启动：

```bash
docker-compose up -d
```

### 分发镜像给其他人

#### 方法一：Docker Hub

```bash
# 登录 Docker Hub
docker login

# 标记镜像
docker tag mingri-lvtu:latest your-username/mingri-lvtu:latest

# 推送到 Docker Hub
docker push your-username/mingri-lvtu:latest

# 其他人拉取
docker pull your-username/mingri-lvtu:latest
```

#### 方法二：导出/导入镜像文件

```bash
# 导出镜像为 tar 文件
docker save mingri-lvtu:latest > mingri-lvtu.tar

# 压缩（可选）
gzip mingri-lvtu.tar

# 在另一台机器上导入
docker load < mingri-lvtu.tar
# 或
docker load < mingri-lvtu.tar.gz
```

### 完整部署流程（给其他开发者）

1. **克隆项目**
   ```bash
   git clone https://github.com/your-username/mingri-lvtu.git
   cd mingri-lvtu
   ```

2. **配置环境变量**
   ```bash
   # 编辑 backend/.env，设置你的 STEPFUN_API_KEY
   ```

3. **启动数据库和应用**
   ```bash
   docker-compose up -d
   ```

4. **初始化数据库**
   ```bash
   docker exec mingri-app node backend/src/database/init.js
   ```

5. **访问应用**
   ```
   http://localhost:3001
   ```

## 🔑 获取 API Keys

### StepFun API Key（必需）

1. 访问 [阶跃星辰官网](https://platform.stepfun.com/)
2. 注册账号并登录
3. 进入控制台，创建 API Key
4. 将 API Key 填入 `.env` 文件的 `STEPFUN_API_KEY`

### 高德地图 API Key（可选）

1. 访问 [高德开放平台](https://lbs.amap.com/)
2. 注册开发者账号
3. 创建应用，获取 Web 服务 API Key
4. 将 API Key 填入 `.env` 文件的 `AMAP_WEB_SERVICE_KEYS`

## 📝 开发指南

### 端口配置

- **前端开发服务器**: `http://localhost:5173`
- **后端 API 服务器**: `http://localhost:3001`
- **API 代理**: 前端 `/api` 请求自动代理到后端

### 数据库管理

#### 查看数据库内容

```bash
# 进入 PostgreSQL 容器
docker exec -it mingri-postgres psql -U postgres -d mingri_lvtu

# 查看所有表
\dt

# 查看表结构
\d posts

# 查询数据
SELECT * FROM posts LIMIT 10;
```

#### 备份数据库

```bash
# 导出数据库
docker exec mingri-postgres pg_dump -U postgres mingri_lvtu > backup.sql

# 导入数据库
docker exec -i mingri-postgres psql -U postgres mingri_lvtu < backup.sql
```

#### 重置数据库

```bash
# 停止并删除容器
docker stop mingri-postgres
docker rm mingri-postgres

# 重新创建容器
docker run --name mingri-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mingri_lvtu \
  -p 5432:5432 \
  -d postgres:latest

# 重新初始化数据库
cd backend
node src/database/init.js
```

### 常用脚本

```bash
# 检查聊天室消息
node backend/check-chatroom-messages.js

# 删除特定聊天室
node backend/delete-jijimiao-chatrooms.js

# 导出帖子数据
node backend/src/database/export-xhs-posts-data.js
```

## 🐛 故障排查

### 数据库连接失败

1. 确认 Docker 容器正在运行：
   ```bash
   docker ps | grep mingri-postgres
   ```

2. 检查端口是否被占用：
   ```bash
   netstat -ano | findstr :5432
   ```

3. 查看容器日志：
   ```bash
   docker logs mingri-postgres
   ```

### 前端无法访问后端 API

1. 确认后端服务正在运行
2. 检查 `.env` 文件中的 `PORT` 配置
3. 查看浏览器控制台的网络请求

### AI 生成失败

1. 确认 `STEPFUN_API_KEY` 已正确配置
2. 检查 API Key 是否有效
3. 查看后端日志中的错误信息

## 📚 API 文档

### 核心接口

#### 发布帖子
```http
POST /api/posts
Content-Type: application/json

{
  "title": "南京之旅",
  "content": "今天去了鸡鸣寺...",
  "city": "南京市",
  "district": "玄武区",
  "locationName": "古鸡鸣寺",
  "lat": 32.061061,
  "lng": 118.795246,
  "mood": "兴奋",
  "imageUrl": "/uploads/image-xxx.jpg"
}
```

#### 创建聊天室
```http
POST /api/chatrooms/create-by-location
Content-Type: application/json

{
  "postId": 123,
  "city": "南京市",
  "district": "玄武区",
  "lat": 32.061061,
  "lng": 118.795246,
  "radius": 1000
}
```

#### 获取聊天室详情
```http
GET /api/chatrooms/:chatroomId/detail
```

更多 API 文档请查看 `docs/api/` 目录。

## 🎨 功能特性

### AI 智能群聊

- **自动匹配**: 根据地理位置（1km范围内）自动匹配附近的旅行者
- **串行对话**: AI 按照真实群聊的顺序生成对话（开场 → 回复 → 追问）
- **实时更新**: 前端每2秒轮询新消息，实现实时效果
- **自然对话**: 基于用户的历史帖子和记忆生成个性化回复

### 地图功能

- **实时定位**: 显示用户当前位置
- **热力图**: 显示热门旅行地点
- **标记点**: 查看附近的旅行笔记
- **路线规划**: 规划旅行路线（开发中）

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 开源协议

本项目采用 MIT 协议开源。

## 🙏 致谢

- [StepFun](https://www.stepfun.com/) - AI 对话生成
- [高德地图](https://lbs.amap.com/) - 地图服务
- [PostgreSQL](https://www.postgresql.org/) - 数据库
- [Express.js](https://expressjs.com/) - 后端框架
- [Vite](https://vitejs.dev/) - 前端构建工具

## 📧 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue
- 发送邮件至：your-email@example.com

---

⭐ 如果这个项目对你有帮助，请给个 Star！
