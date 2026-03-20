# 服务器迁移快速回答 ⚡

## ❌ 不能直接打包传输

**原因**：
- `node_modules` 包含平台相关的二进制文件
- Windows 和 Linux 的依赖不兼容
- 数据库数据在 Docker Volume 中，不在项目目录

---

## ✅ 推荐方案

### 方案1：Git 克隆（最简单）

**在新服务器上执行**：
```bash
# 1. 克隆项目
git clone https://github.com/cnYui/-.git
cd 明日旅途

# 2. 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 3. 配置 API Keys
# 编辑 backend/.env

# 4. 启动数据库
docker-compose up -d

# 5. 初始化数据库
cd backend
node src/database/init.js

# 6. 启动应用
npm run dev
```

**优点**：
- ✅ 最简单、最快
- ✅ 自动获取最新代码
- ✅ 依赖自动适配新平台

**缺点**：
- ❌ 不包含现有数据
- ❌ 不包含上传的图片

---

### 方案2：自动导出脚本（保留数据）

**在旧服务器上执行**：
```powershell
# Windows
.\scripts\export-for-migration.ps1

# Linux/Mac
bash scripts/export-for-migration.sh
```

**会自动**：
- ✅ 复制项目文件（排除 node_modules）
- ✅ 导出数据库
- ✅ 生成迁移说明
- ✅ 打包成 zip/tar.gz

**在新服务器上执行**：
```bash
# 1. 解压
unzip mingri-lvtu-export-*.zip
cd mingri-lvtu-export-*

# 2. 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 3. 启动数据库
docker-compose up -d

# 4. 导入数据库
docker exec -i <容器名> psql -U postgres mingri_lvtu < database_backup.sql

# 5. 启动应用
cd backend && npm run dev
cd frontend && npm run dev
```

---

## 📋 需要迁移的内容

### ✅ 必须迁移
- 源代码（`backend/src/`, `frontend/src/`）
- 配置文件（`backend/.env`, `docker-compose.yml`）
- 依赖配置（`package.json`, `package-lock.json`）

### 📦 可选迁移
- 数据库数据（需要导出/导入）
- 上传的图片（`backend/uploads/`）
- 小红书图片（如果使用了 `XHS_IMAGES_ROOT`）

### ❌ 不要迁移
- `node_modules/` - 重新安装
- `.git/` - 可选
- `backend/pgdata/` - 数据库在 Docker Volume 中

---

## 🎯 选择建议

| 场景 | 推荐方案 | 说明 |
|------|---------|------|
| 全新部署 | 方案1（Git） | 最简单 |
| 保留数据 | 方案2（脚本） | 自动化 |
| 测试环境 | 方案1（Git） | 快速 |
| 生产环境 | 方案2（脚本） | 完整 |

---

## 📞 详细文档

- [完整迁移指南](./SERVER_MIGRATION_GUIDE.md)
- [部署检查清单](./DEPLOYMENT_CHECKLIST.md)
- [快速开始](./QUICK_START.md)
