import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

async function checkRecentJimingPosts() {
  const pool = getPgPool()
  
  try {
    const result = await pool.query(`
      SELECT id, user_id, title, city, district, location_name, lat, lng, created_at
      FROM posts 
      WHERE user_id = 53 AND (location_name LIKE '%鸡鸣%' OR location_name LIKE '%鸡%')
      ORDER BY created_at DESC 
      LIMIT 5
    `)
    
    console.log('最近的鸡鸣寺相关帖子:\n')
    result.rows.forEach(r => {
      console.log(`ID: ${r.id}`)
      console.log(`  标题: ${r.title}`)
      console.log(`  城市: ${r.city}`)
      console.log(`  区县: ${r.district || '无'}`)
      console.log(`  地点: ${r.location_name}`)
      console.log(`  坐标: ${r.lat}, ${r.lng}`)
      console.log(`  时间: ${r.created_at}`)
      console.log('')
    })
    
    // 查找对应的聊天室
    const chatroomResult = await pool.query(`
      SELECT c.id, c.chatroom_name, c.city, c.location_name, c.member_count,
             (SELECT COUNT(*) FROM chatroom_members WHERE chatroom_id = c.id) as actual_members
      FROM chatrooms c
      WHERE c.user_id = 53 AND (c.location_name LIKE '%鸡鸣%' OR c.location_name LIKE '%鸡%')
      ORDER BY c.created_at DESC
      LIMIT 3
    `)
    
    console.log('对应的聊天室:\n')
    chatroomResult.rows.forEach(r => {
      console.log(`聊天室ID: ${r.id}`)
      console.log(`  名称: ${r.chatroom_name}`)
      console.log(`  城市: ${r.city}`)
      console.log(`  地点: ${r.location_name}`)
      console.log(`  成员数(表): ${r.member_count}`)
      console.log(`  成员数(实际): ${r.actual_members}`)
      console.log('')
    })
    
  } catch (error) {
    console.error('❌ 查询失败:', error.message)
  } finally {
    await pool.end()
  }
}

checkRecentJimingPosts()
