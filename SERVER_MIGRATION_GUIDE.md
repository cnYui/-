# 服务器迁移指南 🚀

本文档说明如何将「明日旅途」项目从一台服务器迁移到另一台服务器。

## 📦 方案对比

### 方案 A：直接打包目录（不推荐）
❌ **不能直接打包传输**，原因：
- `node_modules` 文件夹巨大（几百MB）
- 包含平台相关的二进制文件
- 数据库数据在 Docker Volume 中，不在项目目录
- 上传的图片文件可能很大

### 方案 B：Git + 重新安装（推荐）✅
✅ **推荐方式**：使用 Git 克隆 + 重新安装依赖

---

## 🎯 推荐迁移方案（Git 方式）

### 前提条件
新服务器需要安装：
- Node.js >= 18.0.0
- Docker Desktop
- Git

### 迁移步骤

#### 1. 在新服务器上克隆项目
```bash
git clone https://github.com/cnYui/-.git
cd 明日旅途
```

#### 2. 安装依赖
```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

#### 3. 配置环境变量
编辑 `backend/.env`，填入你的 API Keys：
```env
STEPFUN_API_KEY=your_key_here
AMAP_WEB_SERVICE_KEYS=your_keys_here
```

#### 4. 启动 Docker 数据库
```bash
docker-compose up -d
```

#### 5. 初始化数据库
```bash
cd backend
node src/database/init.js
```

#### 6. 启动应用
```bash
# 后端
cd backend
npm run dev

# 前端（新终端）
cd frontend
npm run dev
```

### ✅ 优点
- 文件体积小（不包含 node_modules）
- 自动获取最新代码
- 依赖包适配新服务器平台
- 干净的环境

### ⚠️ 注意事项
- 需要重新配置 `.env` 文件
- 数据库是空的，需要重新导入数据（如果需要）
- 上传的图片不会迁移（需要单独处理）

---

## 📂 方案 C：部分打包迁移（适合有数据）

如果你需要迁移现有数据和上传的文件，使用这个方案。

### 需要迁移的内容

#### ✅ 需要打包的文件/目录
```
明日旅途/
├── backend/
│   ├── src/              ✅ 源代码
│   ├── .env              ✅ 环境变量（包含 API Keys）
│   ├── uploads/          ✅ 用户上传的图片
│   ├── package.json      ✅ 依赖配置
│   └── package-lock.json ✅ 依赖锁定
├── frontend/
│   ├── src/              ✅ 源代码
│   ├── package.json      ✅ 依赖配置
│   └── package-lock.json ✅ 依赖锁定
├── docs/                 ✅ 文档
├── docker-compose.yml    ✅ Docker 配置
└── README.md             ✅ 说明文档
```

#### ❌ 不需要打包的目录
```
backend/node_modules/     ❌ 重新安装
frontend/node_modules/    ❌ 重新安装
backend/pgdata/           ❌ 数据库数据（单独处理）
.git/                     ❌ Git 历史（可选）
```

### 迁移步骤

#### 1. 在旧服务器上打包
```bash
# 方法1：排除 node_modules
cd D:\CodeWorkSpace
tar -czf mingri-lvtu.tar.gz \
  --exclude='明日旅途/backend/node_modules' \
  --exclude='明日旅途/frontend/node_modules' \
  --exclude='明日旅途/backend/pgdata' \
  --exclude='明日旅途/.git' \
  明日旅途/

# 方法2：使用 PowerShell（Windows）
Compress-Archive -Path "明日旅途" -DestinationPath "mingri-lvtu.zip" -Force
# 然后手动删除压缩包中的 node_modules 目录
```

#### 2. 导出数据库（如果需要迁移数据）
```bash
# 导出数据库
docker exec <容器名> pg_dump -U postgres mingri_lvtu > mingri_lvtu_backup.sql

# 或者导出整个 Docker Volume
docker run --rm \
  -v mingri_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data.tar.gz /data
```

#### 3. 传输到新服务器
```bash
# 使用 scp（Linux/Mac）
scp mingri-lvtu.tar.gz user@new-server:/path/to/destination/
scp mingri_lvtu_backup.sql user@new-server:/path/to/destination/

# 或使用 FTP/SFTP 工具（Windows）
# 如 FileZilla, WinSCP 等
```

#### 4. 在新服务器上解压
```bash
cd /path/to/destination/
tar -xzf mingri-lvtu.tar.gz
cd 明日旅途
```

#### 5. 安装依赖
```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

#### 6. 启动 Docker 数据库
```bash
cd ..
docker-compose up -d
```

#### 7. 导入数据库（如果有备份）
```bash
# 方法1：导入 SQL 文件
docker exec -i <容器名> psql -U postgres mingri_lvtu < mingri_lvtu_backup.sql

# 方法2：恢复 Docker Volume
docker run --rm \
  -v mingri_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres_data.tar.gz -C /
```

#### 8. 启动应用
```bash
# 后端
cd backend
npm run dev

# 前端（新终端）
cd frontend
npm run dev
```

---

## 🐳 方案 D：Docker 镜像迁移（未来支持）

如果项目已经打包成 Docker 镜像，可以使用这个方案。

### 导出镜像
```bash
# 在旧服务器
docker save mingri-lvtu:latest > mingri-lvtu-image.tar
```

### 传输并导入
```bash
# 传输到新服务器
scp mingri-lvtu-image.tar user@new-server:/path/

# 在新服务器导入
docker load < mingri-lvtu-image.tar
```

### 启动容器
```bash
docker-compose up -d
```

---

## 📋 迁移检查清单

### 迁移前（旧服务器）
- [ ] 备份数据库
- [ ] 备份上传的图片（`backend/uploads/`）
- [ ] 记录 `.env` 中的 API Keys
- [ ] 导出项目文件（排除 node_modules）

### 迁移后（新服务器）
- [ ] 安装 Node.js >= 18.0.0
- [ ] 安装 Docker Desktop
- [ ] 解压项目文件
- [ ] 配置 `.env` 文件
- [ ] 安装依赖（`npm install`）
- [ ] 启动 Docker 数据库
- [ ] 导入数据库备份（如果有）
- [ ] 初始化数据库表结构（如果是空库）
- [ ] 启动应用
- [ ] 验证功能正常

### 验证清单
```bash
# 1. 检查 Docker 容器
docker ps

# 2. 检查数据库表
docker exec <容器名> psql -U postgres -d mingri_lvtu -c "\dt"

# 3. 检查后端服务
curl http://localhost:3001/health

# 4. 检查前端页面
# 浏览器访问 http://localhost:5173

# 5. 测试核心功能
# - 用户登录
# - 发布帖子
# - AI 群聊
# - 地图显示
```

---

## 🔧 常见问题

### Q1: node_modules 可以直接复制吗？
❌ **不推荐**
- 包含平台相关的二进制文件（如 sharp、sqlite3）
- Windows 和 Linux 的二进制文件不兼容
- 文件数量巨大，传输慢

✅ **推荐**：在新服务器上重新 `npm install`

### Q2: 数据库数据在哪里？
数据库数据在 Docker Volume 中，不在项目目录：
```bash
# 查看 Volume
docker volume ls | grep postgres

# Volume 位置（Linux）
/var/lib/docker/volumes/mingri_postgres_data/_data

# Volume 位置（Windows）
\\wsl$\docker-desktop-data\data\docker\volumes\mingri_postgres_data\_data
```

### Q3: 上传的图片在哪里？
```
backend/uploads/
```
这个目录需要单独打包迁移。

### Q4: .env 文件会被 Git 忽略吗？
✅ 本项目的 `.env` 文件已提交到 Git，会自动同步。
但建议在新服务器上检查并更新 API Keys。

### Q5: 需要修改哪些配置？
通常只需要修改 `backend/.env`：
```env
# 如果数据库容器名不同
POSTGRES_HOST=新容器名或127.0.0.1

# 如果端口冲突
PORT=新端口号

# 如果有新的 API Keys
STEPFUN_API_KEY=新的key
AMAP_WEB_SERVICE_KEYS=新的keys
```

### Q6: 如何迁移小红书图片数据？
如果使用了 `XHS_IMAGES_ROOT`：
```bash
# 1. 打包图片目录
tar -czf xhs-images.tar.gz /path/to/MediaCrawler/data/xhs/images

# 2. 传输到新服务器
scp xhs-images.tar.gz user@new-server:/path/

# 3. 解压
tar -xzf xhs-images.tar.gz

# 4. 更新 .env 中的路径
XHS_IMAGES_ROOT=/new/path/to/xhs/images
```

---

## 🎯 推荐方案总结

### 场景1：全新部署（无数据）
**推荐**：方案 B（Git 克隆）
- 最简单、最干净
- 自动获取最新代码

### 场景2：迁移现有数据
**推荐**：方案 C（部分打包）
- 保留用户数据和上传文件
- 重新安装依赖适配新平台

### 场景3：频繁迁移
**推荐**：方案 D（Docker 镜像）
- 需要先构建 Docker 镜像
- 一次构建，到处运行

---

## 📞 获取帮助

如遇到迁移问题：
1. 查看 [README.md](./README.md) 故障排查部分
2. 查看 [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
3. 在 GitHub 提交 Issue

---

**更新时间**：2026-03-20
**文档版本**：v1.0
