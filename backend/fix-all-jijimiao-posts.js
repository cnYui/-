import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

async function fixAllJijimiaoPostsAndChatrooms() {
  const pool = getPgPool()
  
  try {
    console.log('🔧 修复所有吉鸡寺相关的帖子和聊天室...\n')
    
    // 修复帖子1677和1678
    await pool.query(`
      UPDATE posts 
      SET city = $1, district = $2 
      WHERE id IN (1677, 1678)
    `, ['南京市', '玄武区'])
    
    console.log('✅ 已修复帖子1677和1678的城市字段\n')
    
    // 删除所有吉鸡寺相关的聊天室
    const deleteResult = await pool.query(`
      DELETE FROM chatrooms 
      WHERE location_name LIKE '%吉鸡%' OR location_name LIKE '%古鸡鸣%'
      RETURNING id, chatroom_name
    `)
    
    if (deleteResult.rows.length > 0) {
      console.log(`✅ 已删除 ${deleteResult.rows.length} 个聊天室:`)
      deleteResult.rows.forEach(r => {
        console.log(`  - ID ${r.id}: ${r.chatroom_name}`)
      })
    } else {
      console.log('ℹ️  没有找到需要删除的聊天室')
    }
    console.log('')
    
    // 验证修复结果
    const result = await pool.query(`
      SELECT id, city, district, location_name, lat, lng
      FROM posts 
      WHERE id IN (1677, 1678)
      ORDER BY id
    `)
    
    console.log('修复后的帖子信息:')
    result.rows.forEach(r => {
      console.log(`  ID ${r.id}: ${r.city} - ${r.district} - ${r.location_name}`)
      console.log(`    坐标: ${r.lat}, ${r.lng}`)
    })
    console.log('')
    
    console.log('💡 下一步:')
    console.log('   1. 刷新前端页面')
    console.log('   2. 在保存记录页面点击"正式发布"按钮')
    console.log('   3. 查看浏览器控制台的详细日志')
    console.log('   4. 新聊天室应该有10个成员（包括你自己）')
    
  } catch (error) {
    console.error('❌ 修复失败:', error.message)
    console.error(error)
  } finally {
    await pool.end()
  }
}

fixAllJijimiaoPostsAndChatrooms()
