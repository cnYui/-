import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

async function fixPost1679() {
  const pool = getPgPool()
  
  try {
    await pool.query('UPDATE posts SET city = $1, district = $2 WHERE id = $3', ['南京市', '玄武区', 1679])
    console.log('✅ 已修复帖子1679的城市字段')
    
    await pool.query('DELETE FROM chatrooms WHERE id = 8')
    console.log('✅ 已删除聊天室8')
    
  } catch (error) {
    console.error('❌ 修复失败:', error.message)
  } finally {
    await pool.end()
  }
}

fixPost1679()
