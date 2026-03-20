import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

async function checkLatestChatroom() {
  const pool = getPgPool()
  
  try {
    // 查找最新的聊天室
    const chatroomResult = await pool.query(`
      SELECT c.id, c.chatroom_name, c.city, c.location_name, c.member_count, c.created_at,
             (SELECT COUNT(*) FROM chatroom_members WHERE chatroom_id = c.id) as actual_members
      FROM chatrooms c
      WHERE c.user_id = 53
      ORDER BY c.created_at DESC
      LIMIT 1
    `)
    
    if (chatroomResult.rows.length === 0) {
      console.log('❌ 没有找到聊天室')
      return
    }
    
    const chatroom = chatroomResult.rows[0]
    console.log('📊 最新聊天室信息:')
    console.log(`  ID: ${chatroom.id}`)
    console.log(`  名称: ${chatroom.chatroom_name}`)
    console.log(`  城市: ${chatroom.city}`)
    console.log(`  地点: ${chatroom.location_name}`)
    console.log(`  成员数(表): ${chatroom.member_count}`)
    console.log(`  成员数(实际): ${chatroom.actual_members}`)
    console.log(`  创建时间: ${chatroom.created_at}`)
    console.log('')
    
    // 查找成员
    const membersResult = await pool.query(`
      SELECT m.user_id, u.nickname
      FROM chatroom_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.chatroom_id = $1
    `, [chatroom.id])
    
    console.log('👥 成员列表:')
    membersResult.rows.forEach(m => {
      console.log(`  - ${m.nickname} (ID: ${m.user_id})`)
    })
    console.log('')
    
    // 查找消息
    const messagesResult = await pool.query(`
      SELECT cm.id, cm.user_id, cm.content, cm.is_ai_agent, cm.created_at, u.nickname
      FROM chatroom_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.chatroom_id = $1
      ORDER BY cm.created_at ASC
    `, [chatroom.id])
    
    console.log(`💬 消息列表 (共${messagesResult.rows.length}条):`)
    messagesResult.rows.forEach((m, i) => {
      const isAi = Number(m.is_ai_agent) === 1
      console.log(`  ${i + 1}. ${m.nickname} ${isAi ? '(AI分身)' : '(系统)'}:`)
      console.log(`     ${m.content.substring(0, 60)}${m.content.length > 60 ? '...' : ''}`)
    })
    
  } catch (error) {
    console.error('❌ 查询失败:', error.message)
  } finally {
    await pool.end()
  }
}

checkLatestChatroom()
