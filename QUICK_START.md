# 快速开始指南 🚀

## 准备工作（5分钟）

### 1. 必需项 ✅

- [ ] **Docker Desktop** - 已安装并运行
- [ ] **StepFun API Key** - [获取地址](https://platform.stepfun.com/)
- [ ] **高德地图 API Keys** - [获取地址](https://lbs.amap.com/)

### 2. 可选项 ⚙️

- [ ] **小红书图片目录** - 如果不需要导入小红书数据，可跳过
- [ ] **PostgreSQL 端口** - 默认暴露 5432，如不需要外部访问可关闭

> 📋 详细说明请查看 [部署前检查清单](./DEPLOYMENT_CHECKLIST.md)

## 部署步骤（10分钟）

### 1️⃣ 克隆项目
```bash
git clone https://github.com/cnYui/-.git
cd 明日旅途
```

### 2️⃣ 配置 API Keys
编辑 `backend/.env`，填入你的密钥：
```env
STEPFUN_API_KEY=your_stepfun_api_key_here
AMAP_WEB_SERVICE_KEYS=your_amap_key1,your_amap_key2
```

### 3️⃣ 启动数据库
```bash
docker-compose up -d
```

### 4️⃣ 安装依赖
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 5️⃣ 初始化数据库
```bash
cd backend
node src/database/init.js
```

### 6️⃣ 启动应用
```bash
# 终端1 - 后端
cd backend
npm run dev

# 终端2 - 前端
cd frontend
npm run dev
```

### 7️⃣ 访问应用
- 🌐 前端：http://localhost:5173
- 🔌 后端：http://localhost:3001

## 验证部署 ✓

```bash
# 检查 Docker 容器
docker ps

# 检查数据库表
docker exec <容器名> psql -U postgres -d mingri_lvtu -c "\dt"

# 检查后端服务
curl http://localhost:3001/api/health
```

## 遇到问题？

1. 查看 [部署前检查清单](./DEPLOYMENT_CHECKLIST.md)
2. 查看 [README.md](./README.md) 故障排查部分
3. 在 GitHub 提交 Issue

---

🎉 部署完成！开始你的旅行社交之旅吧！
