# 部署前检查清单 📋

在部署「明日旅途」项目之前，请确保以下所有项目都已准备就绪。

## ✅ 必需项

### 1. Docker Desktop
- [ ] 已安装 Docker Desktop
- [ ] Docker Desktop 正在运行
- [ ] 验证命令：`docker --version` 和 `docker-compose --version`

```bash
# 验证 Docker 是否可用
docker --version
docker-compose --version
docker ps
```

### 2. StepFun API Key（必需）
- [ ] 已注册 [StepFun 阶跃星辰](https://platform.stepfun.com/) 账号
- [ ] 已创建 API Key
- [ ] 已将 API Key 填入 `backend/.env` 文件的 `STEPFUN_API_KEY`

**用途**：AI 智能群聊对话生成、图片理解等核心功能

**获取方式**：
1. 访问 https://platform.stepfun.com/
2. 注册并登录
3. 进入控制台 → API Keys
4. 创建新的 API Key

**配置位置**：`backend/.env`
```env
STEPFUN_API_KEY=your_stepfun_api_key_here
```

### 3. 高德地图 API Keys（必需）
- [ ] 已注册 [高德开放平台](https://lbs.amap.com/) 账号
- [ ] 已创建应用并获取 Web 服务 API Key
- [ ] 已将 API Keys 填入 `backend/.env` 文件的 `AMAP_WEB_SERVICE_KEYS`

**用途**：地理编码、逆地理编码、地址解析等地图功能

**获取方式**：
1. 访问 https://lbs.amap.com/
2. 注册开发者账号并登录
3. 进入控制台 → 应用管理 → 创建新应用
4. 添加 Key，选择「Web 服务」类型
5. 可以创建多个 Key（用逗号分隔，支持负载均衡）

**配置位置**：`backend/.env`
```env
AMAP_WEB_SERVICE_KEYS=key1,key2,key3
```

## 🔧 可选项

### 4. 小红书图片目录（可选）
- [ ] 确认是否需要导入小红书数据
- [ ] 如果需要，确认图片目录路径

**当前配置**：
```env
XHS_IMAGES_ROOT=D:/CodeWorkSpace/MediaCrawler/data/xhs/images
```

**选项**：

#### 选项 A：保留当前路径（如果你有 MediaCrawler 数据）
- 确保路径 `D:\CodeWorkSpace\MediaCrawler\data\xhs\images` 存在
- 该目录包含小红书爬取的图片数据
- 无需修改 `.env` 文件

#### 选项 B：使用新路径
- 在 `backend/.env` 中修改 `XHS_IMAGES_ROOT` 为新路径
- 例如：`XHS_IMAGES_ROOT=D:/MyProject/xhs-images`

#### 选项 C：不使用小红书数据（推荐新用户）
- 注释掉或删除 `.env` 中的 `XHS_IMAGES_ROOT` 配置
- 项目仍可正常运行，只是没有预导入的小红书数据
- 用户可以自己发布新内容

**影响范围**：
- 仅影响数据导入脚本（`import-xhs-posts.js` 等）
- 不影响核心功能（发布帖子、AI 群聊、地图等）

### 5. PostgreSQL 端口配置
- [ ] 确认是否需要从外部访问数据库

**当前配置**：
```yaml
# docker-compose.yml
ports:
  - "5432:5432"  # 暴露到宿主机
```

**选项**：

#### 选项 A：保持端口暴露（当前配置）
- 可以从宿主机直接访问数据库
- 方便使用 pgAdmin、DBeaver 等工具管理
- 适合开发环境

#### 选项 B：不暴露端口（生产环境推荐）
修改 `docker-compose.yml`：
```yaml
# 注释掉或删除 ports 配置
# ports:
#   - "5432:5432"
```
- 数据库仅在 Docker 内部网络可访问
- 更安全，防止外部直接访问
- 后端应用仍可正常连接（通过容器名）

**如果不暴露端口，需要修改 `backend/.env`**：
```env
# 使用容器名而不是 127.0.0.1
POSTGRES_HOST=mingri-postgres  # 或你的容器名
```

## 📝 环境变量配置检查

打开 `backend/.env` 文件，确认以下配置：

```env
# ========== 必需配置 ==========

# StepFun AI API（必需）
STEPFUN_API_KEY=your_stepfun_api_key_here

# 高德地图 API（必需）
AMAP_WEB_SERVICE_KEYS=your_amap_key1,your_amap_key2

# 数据库配置（必需）
DB_CLIENT=postgres
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=mingri_lvtu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# ========== 可选配置 ==========

# 小红书图片目录（可选，如果不用可以注释掉）
# XHS_IMAGES_ROOT=D:/CodeWorkSpace/MediaCrawler/data/xhs/images

# 小红书 CSV 数据路径（可选）
# XHS_CSV_PATH=D:/path/to/your/xhs_data.csv

# 其他小红书相关配置（可选）
# XHS_TRAVEL_INTEL_OUTPUT_DIR=./backend/output/xhs-location-guides
# XHS_GUIDES_DATASET_OUTPUT=./backend/output/xhs-location-guides/xhs_posts_dataset.json
```

## 🚀 部署步骤

完成上述检查后，按以下步骤部署：

### 1. 克隆项目
```bash
git clone https://github.com/cnYui/-.git
cd 明日旅途
```

### 2. 配置环境变量
```bash
# 编辑 backend/.env
# 填入你的 STEPFUN_API_KEY 和 AMAP_WEB_SERVICE_KEYS
```

### 3. 启动 Docker 数据库
```bash
docker-compose up -d
```

### 4. 安装依赖
```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

### 5. 初始化数据库
```bash
cd backend
node src/database/init.js
```

### 6. 启动应用
```bash
# 启动后端（终端1）
cd backend
npm run dev

# 启动前端（终端2）
cd frontend
npm run dev
```

### 7. 访问应用
- 前端：http://localhost:5173
- 后端 API：http://localhost:3001

## 🔍 验证部署

### 检查 Docker 容器
```bash
docker ps
# 应该看到 PostgreSQL 容器正在运行
```

### 检查数据库连接
```bash
docker exec <容器名> psql -U postgres -d mingri_lvtu -c "\dt"
# 应该看到 13 个表
```

### 检查后端服务
```bash
curl http://localhost:3001/api/health
# 或在浏览器访问
```

### 检查前端页面
在浏览器访问 http://localhost:5173，应该能看到登录页面

## ⚠️ 常见问题

### 1. Docker 容器启动失败
- 检查 Docker Desktop 是否正在运行
- 检查 5432 端口是否被占用：`netstat -ano | findstr :5432`
- 查看容器日志：`docker logs <容器名>`

### 2. 数据库连接失败
- 确认容器正在运行：`docker ps`
- 检查 `.env` 中的数据库配置
- 确认 `POSTGRES_HOST` 和端口配置正确

### 3. API Key 无效
- 确认 StepFun API Key 是否正确
- 检查 API Key 是否有余额
- 查看后端日志中的错误信息

### 4. 小红书图片路径不存在
- 如果不需要小红书数据，注释掉 `XHS_IMAGES_ROOT`
- 如果需要，确保路径存在且可访问
- 检查路径分隔符（Windows 使用 `/` 或 `\\`）

## 📞 获取帮助

如遇到问题，请：
1. 查看 `README.md` 中的故障排查部分
2. 查看后端日志输出
3. 在 GitHub 提交 Issue

---

✅ 完成所有检查项后，即可开始部署！
