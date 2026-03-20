import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

async function fixJijimiaoPostCity() {
  const pool = getPgPool()
  
  try {
    console.log('🔧 修复吉鸡寺帖子的城市字段...\n')
    
    // 修复帖子1677
    await pool.query(`
      UPDATE posts 
      SET city = $1, district = $2 
      WHERE id = $3
    `, ['南京市', '玄武区', 1677])
    
    console.log('✅ 已修复帖子1677的城市字段\n')
    
    // 验证修复结果
    const result = await pool.query(`
      SELECT id, city, district, location_name, lat, lng
      FROM posts 
      WHERE id = 1677
    `)
    
    console.log('修复后的帖子信息:')
    console.log(result.rows[0])
    console.log('')
    
    // 删除旧聊天室，让用户重新发帖创建新的
    console.log('🗑️  删除旧聊天室...\n')
    
    const deleteResult = await pool.query(`
      DELETE FROM chatrooms 
      WHERE id = 6
      RETURNING id, chatroom_name
    `)
    
    if (deleteResult.rows.length > 0) {
      console.log(`✅ 已删除聊天室: ${deleteResult.rows[0].chatroom_name} (ID: ${deleteResult.rows[0].id})`)
    }
    
    console.log('\n💡 下一步:')
    console.log('   1. 用户需要重新发布吉鸡寺的帖子（或点击"正式发布"按钮）')
    console.log('   2. 系统会自动创建新聊天室，并匹配到1km内的9个用户')
    console.log('   3. 聊天室将有10个成员（包括用户自己）')
    
  } catch (error) {
    console.error('❌ 修复失败:', error.message)
    console.error(error)
  } finally {
    await pool.end()
  }
}

fixJijimiaoPostCity()
