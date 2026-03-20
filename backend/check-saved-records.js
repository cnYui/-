import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

async function checkSavedRecords() {
  const pool = getPgPool()
  
  try {
    console.log('📊 检查保存记录表...\n')
    
    // 检查表是否存在
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'saved_post_records'
      )
    `)
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ saved_post_records 表不存在')
      return
    }
    
    console.log('✅ saved_post_records 表存在\n')
    
    // 查询所有记录
    const result = await pool.query(`
      SELECT id, user_id, title, city, location_name, 
             generation_status, published_post_id, created_at
      FROM saved_post_records 
      ORDER BY id
    `)
    
    console.log(`📝 保存记录总数: ${result.rows.length}\n`)
    
    if (result.rows.length === 0) {
      console.log('ℹ️  数据库中没有保存记录')
      console.log('💡 用户需要先在前端保存帖子，才会有记录')
    } else {
      result.rows.forEach(r => {
        console.log(`ID: ${r.id}`)
        console.log(`  用户ID: ${r.user_id}`)
        console.log(`  标题: ${r.title}`)
        console.log(`  城市: ${r.city}`)
        console.log(`  地点: ${r.location_name}`)
        console.log(`  生成状态: ${r.generation_status}`)
        console.log(`  已发布帖子ID: ${r.published_post_id || '未发布'}`)
        console.log(`  创建时间: ${r.created_at}`)
        console.log('')
      })
    }
    
    // 检查用户表
    const userResult = await pool.query('SELECT id, username FROM users ORDER BY id')
    console.log(`👥 用户总数: ${userResult.rows.length}`)
    userResult.rows.forEach(u => {
      console.log(`  用户ID: ${u.id}, 用户名: ${u.username}`)
    })
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
  } finally {
    await pool.end()
  }
}

checkSavedRecords()
