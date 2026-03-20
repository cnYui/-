import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

import routes from './routes/index.js'
import { initDatabase } from './database/init.js'
import { getDatabaseRuntimeInfo } from './database/pg-client.js'
import { attachAuthSession } from './middleware/auth-session.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载 backend/.env 文件 (__dirname 是 backend/src，所以 ../.env 是 backend/.env)
dotenv.config({ path: path.join(__dirname, '../.env') })

// 验证关键环境变量
console.log('🔑 环境变量检查:')
console.log('  - STEPFUN_API_KEY:', process.env.STEPFUN_API_KEY ? '已配置 ✅' : '未配置 ❌')
console.log('  - DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '已配置 ✅' : '未配置 ❌')

const dbRuntimeInfo = getDatabaseRuntimeInfo()
console.log('🗄️ DB_CLIENT:', dbRuntimeInfo.dbClient)
console.log('🗄️ DATABASE_PATH:', dbRuntimeInfo.databasePath || '(not used in postgres mode)')
console.log('🗄️ POSTGRES:', `${dbRuntimeInfo.postgresHost}:${dbRuntimeInfo.postgresPort}/${dbRuntimeInfo.postgresDb} user=${dbRuntimeInfo.postgresUser}`)

// 初始化数据库
console.log('🔄 初始化数据库...')
try {
  await initDatabase()
} catch (error) {
  console.error('❌ 数据库初始化失败:', error.message)
}

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors())
app.use(express.json())
app.use(attachAuthSession)

// 静态文件服务 - 提供上传的图片访问
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

const defaultXhsImagesRoot = path.resolve(__dirname, '../../../MediaCrawler/data/xhs/images')
const xhsImagesRoot = process.env.XHS_IMAGES_ROOT || defaultXhsImagesRoot
app.use('/xhs-images', express.static(xhsImagesRoot))

// 路由
app.use('/api', routes)

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`✅ 后端服务运行在 http://localhost:${PORT}`)
})
