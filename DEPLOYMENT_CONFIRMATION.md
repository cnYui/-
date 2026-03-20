# 部署确认文档 ✅

## 1. PostgreSQL 表结构定义

### ✅ 最终答案：以 `schema-postgres.sql` 为准

**原因**：
- `backend/src/database/init.js` 在启动时会读取并执行 `schema-postgres.sql`
- `migrate-postgres.js` 是一个独立的迁移脚本，需要手动执行
- 当前项目的自动初始化流程使用的是 `schema-postgres.sql`

**表结构文件**：
```
backend/src/database/schema-postgres.sql  ← 这个是标准
```

**初始化命令**：
```bash
cd backend
node src/database/init.js
```

**关键差异**：
- `schema-postgres.sql`: 使用 `SERIAL`（INTEGER 自增）
- `migrate-postgres.js`: 使用 `BIGSERIAL`（BIGINT 自增）

**建议**：
- 新部署使用 `schema-postgres.sql`（通过 `init.js` 自动执行）
- 如需迁移现有数据，可以手动运行 `migrate-postgres.js`

---

## 2. 环境变量必填/可选清单

### ✅ 必填环境变量（服务启动必需）

#### 数据库配置（必需）
```env
DB_CLIENT=postgres
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=mingri_lvtu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
```

#### AI 服务（至少一个必需）
```env
# 选项1：StepFun（推荐）
STEPFUN_API_KEY=your_key_here

# 选项2：DeepSeek（可选）
DEEPSEEK_API_KEY=your_key_here
```

**说明**：
- AI 群聊功能需要 `STEPFUN_API_KEY` 或 `DEEPSEEK_API_KEY` 至少一个
- 代码逻辑：优先使用 DeepSeek，如果没有则使用 StepFun
- 位置：`backend/src/services/deepseek.js` 第 20-25 行

```javascript
const useStepFun = !DEEPSEEK_API_KEY && STEPFUN_API_KEY;

if (!DEEPSEEK_API_KEY && !STEPFUN_API_KEY) {
    throw new Error('缺少 DEEPSEEK_API_KEY 或 STEPFUN_API_KEY 环境变量');
}
```

### ⚙️ 可选环境变量（不影响基础启动）

#### 高德地图 API（可选）
```env
AMAP_WEB_SERVICE_KEYS=key1,key2
```

**用途**：
- 地理编码（地址 → 坐标）
- 逆地理编码（坐标 → 地址）
- 仅在数据导入脚本中使用

**影响范围**：
- `backend/src/database/regeocode-all-posts.js`
- `backend/src/database/fix-saved-record-city.js`
- `backend/src/database/run-xhs-slim-full-pipeline.js`
- `backend/src/database/run-xhs-unified-pipeline.js`

**不影响**：
- 前端地图显示（前端使用自己的高德 Key）
- 用户发布帖子
- AI 群聊功能
- 基础服务启动

#### SecondMe OAuth（可选）
```env
# 后端不需要配置
# 前端硬编码：SECONDME_CLIENT_ID = '1fd10355-ad04-43b1-a479-5a868b505130'
```

**说明**：
- SecondMe 配置完全在前端（`frontend/src/js/services.js`）
- 后端只提供代理接口（`backend/src/routes/secondme.js`）
- 不影响基础功能启动

#### 小红书相关（可选）
```env
XHS_IMAGES_ROOT=D:/path/to/xhs/images
XHS_CSV_PATH=D:/path/to/xhs/data.csv
XHS_TRAVEL_INTEL_OUTPUT_DIR=./backend/output
# ... 其他 XHS_ 开头的配置
```

**用途**：仅用于数据导入脚本
**不影响**：服务启动和核心功能

---

## 3. XHS_IMAGES_ROOT 目录依赖

### ✅ 答案：不是必需，不影响服务启动

**代码分析**：

#### 使用位置
```javascript
// backend/src/index.js 第 48-50 行
const defaultXhsImagesRoot = path.resolve(__dirname, '../../../MediaCrawler/data/xhs/images')
const xhsImagesRoot = process.env.XHS_IMAGES_ROOT || defaultXhsImagesRoot
app.use('/xhs-images', express.static(xhsImagesRoot))
```

#### 影响范围
- 仅影响 `/xhs-images/*` 静态文件路由
- 如果目录不存在，访问该路由会返回 404
- **不会导致服务启动失败**

#### 测试验证
```bash
# 即使目录不存在，服务也能正常启动
# 只是访问 http://localhost:3001/xhs-images/xxx 会返回 404
```

#### 使用场景
- 数据导入脚本：`import-xhs-posts.js`、`import-xhs-slim-csv.js`
- 前端访问小红书图片：`/xhs-images/<note_id>/<image_file>`

#### 建议
- **新用户**：注释掉或删除 `XHS_IMAGES_ROOT` 配置
- **有数据用户**：确保路径存在且可访问
- **Docker 部署**：如需使用，需要挂载 volume

---

## 4. 数据库初始化要求

### ✅ 答案：空库启动即可，不需要初始化数据

**初始化流程**：

#### 步骤1：启动 Docker 容器
```bash
docker-compose up -d
```
- 创建空的 PostgreSQL 数据库
- 数据库名：`mingri_lvtu`

#### 步骤2：执行表结构初始化
```bash
cd backend
node src/database/init.js
```
- 读取 `schema-postgres.sql`
- 创建 13 个表
- 插入默认测试用户（ID: 53, username: 'test'）

#### 步骤3：启动应用
```bash
npm run dev
```
- 应用会自动调用 `initDatabase()`
- 如果表已存在，会跳过创建

**默认数据**：
- 仅包含 1 个测试用户（ID: 53）
- 其他表为空
- 用户可以立即开始发布内容

**可选数据导入**：
如果需要导入小红书数据（可选）：
```bash
# 需要先配置 XHS_CSV_PATH 和 XHS_IMAGES_ROOT
node backend/src/database/import-xhs-posts.js
```

---

## 📋 最小启动配置总结

### 必需配置（`.env` 文件）
```env
# 数据库（必需）
DB_CLIENT=postgres
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=mingri_lvtu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# AI 服务（至少一个）
STEPFUN_API_KEY=your_stepfun_key_here
# 或
# DEEPSEEK_API_KEY=your_deepseek_key_here
```

### 可选配置（可注释或删除）
```env
# 高德地图（仅数据导入脚本需要）
# AMAP_WEB_SERVICE_KEYS=key1,key2

# 小红书数据（仅数据导入脚本需要）
# XHS_IMAGES_ROOT=D:/path/to/xhs/images
# XHS_CSV_PATH=D:/path/to/xhs/data.csv

# DeepSeek（如果已配置 StepFun 则不需要）
# DEEPSEEK_API_KEY=your_deepseek_key_here
```

### 启动命令
```bash
# 1. 启动数据库
docker-compose up -d

# 2. 初始化表结构（首次必须）
cd backend
node src/database/init.js

# 3. 启动后端
npm run dev

# 4. 启动前端（新终端）
cd frontend
npm run dev
```

### 验证启动成功
```bash
# 检查数据库
docker exec <容器名> psql -U postgres -d mingri_lvtu -c "\dt"

# 检查后端
curl http://localhost:3001/health

# 检查前端
# 浏览器访问 http://localhost:5173
```

---

## 🎯 关键结论

1. **表结构**：使用 `schema-postgres.sql`（通过 `init.js` 自动执行）
2. **必需 API**：`STEPFUN_API_KEY` 或 `DEEPSEEK_API_KEY`（至少一个）
3. **可选 API**：`AMAP_WEB_SERVICE_KEYS`（仅数据导入需要）
4. **图片目录**：`XHS_IMAGES_ROOT` 不是必需，不影响启动
5. **初始化**：空库启动，只需执行 `init.js` 创建表结构
6. **SecondMe**：完全可选，前端配置，不影响后端启动

---

**更新时间**：2026-03-20
**文档版本**：v1.0
