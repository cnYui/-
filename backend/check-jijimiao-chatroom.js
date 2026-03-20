import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

/**
 * Haversine 公式计算两点距离（米）
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lng2 - lng1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
}

async function checkJijimiaoArea() {
  const pool = getPgPool()
  
  try {
    console.log('🔍 检查吉鸡寺区域的聊天室和帖子情况\n')
    
    // 查找吉鸡寺相关的帖子
    const jijimiaoPostsResult = await pool.query(`
      SELECT id, user_id, title, content, location_name, city, district, lat, lng, created_at
      FROM posts
      WHERE location_name LIKE '%吉鸡%' OR location_name LIKE '%古鸡鸣%'
      ORDER BY created_at DESC
    `)
    
    console.log(`📍 吉鸡寺相关帖子: ${jijimiaoPostsResult.rows.length} 条\n`)
    
    if (jijimiaoPostsResult.rows.length === 0) {
      console.log('❌ 没有找到吉鸡寺相关的帖子')
      return
    }
    
    // 显示所有吉鸡寺帖子
    jijimiaoPostsResult.rows.forEach(post => {
      console.log(`帖子 ID: ${post.id}`)
      console.log(`  用户ID: ${post.user_id}`)
      console.log(`  标题: ${post.title || '无标题'}`)
      console.log(`  地点: ${post.location_name}`)
      console.log(`  城市: ${post.city} - ${post.district || ''}`)
      console.log(`  坐标: ${post.lat}, ${post.lng}`)
      console.log(`  发布时间: ${post.created_at}`)
      console.log('')
    })
    
    // 以第一个吉鸡寺帖子为中心，查找1km内的所有帖子
    const centerPost = jijimiaoPostsResult.rows[0]
    const centerLat = Number(centerPost.lat)
    const centerLng = Number(centerPost.lng)
    
    console.log(`\n📊 以帖子 ${centerPost.id} 为中心，查找1km内的所有帖子...\n`)
    
    // 查询同城的所有公开帖子
    const allPostsResult = await pool.query(`
      SELECT p.id, p.user_id, p.title, p.location_name, p.city, p.district, p.lat, p.lng, p.is_public, p.created_at,
             u.nickname
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.city = $1 AND p.is_public = 1
      ORDER BY p.created_at DESC
    `, [centerPost.city])
    
    console.log(`🏙️  ${centerPost.city} 所有公开帖子: ${allPostsResult.rows.length} 条\n`)
    
    // 计算距离并筛选1km内的帖子
    const nearbyPosts = allPostsResult.rows
      .map(post => ({
        ...post,
        distance: Math.round(calculateDistance(centerLat, centerLng, Number(post.lat), Number(post.lng)))
      }))
      .filter(post => post.distance <= 1000)
      .sort((a, b) => a.distance - b.distance)
    
    console.log(`📍 1km内的帖子: ${nearbyPosts.length} 条\n`)
    
    // 按用户分组
    const userPostsMap = new Map()
    nearbyPosts.forEach(post => {
      if (!userPostsMap.has(post.user_id)) {
        userPostsMap.set(post.user_id, [])
      }
      userPostsMap.get(post.user_id).push(post)
    })
    
    console.log(`👥 涉及用户数: ${userPostsMap.size} 人\n`)
    
    // 显示每个用户的帖子
    for (const [userId, posts] of userPostsMap.entries()) {
      const user = posts[0]
      console.log(`用户: ${user.nickname} (ID: ${userId})`)
      posts.forEach(post => {
        console.log(`  - 帖子 ${post.id}: ${post.location_name} (距离: ${post.distance}m)`)
      })
      console.log('')
    }
    
    // 查找吉鸡寺相关的聊天室
    console.log('\n💬 查找吉鸡寺相关的聊天室...\n')
    
    const chatroomsResult = await pool.query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM chatroom_members WHERE chatroom_id = c.id) as actual_member_count
      FROM chatrooms c
      WHERE c.location_name LIKE '%吉鸡%' OR c.location_name LIKE '%古鸡鸣%'
         OR c.chatroom_name LIKE '%吉鸡%' OR c.chatroom_name LIKE '%古鸡鸣%'
      ORDER BY c.created_at DESC
    `)
    
    console.log(`聊天室数量: ${chatroomsResult.rows.length}\n`)
    
    for (const chatroom of chatroomsResult.rows) {
      console.log(`聊天室 ID: ${chatroom.id}`)
      console.log(`  名称: ${chatroom.chatroom_name}`)
      console.log(`  地点: ${chatroom.location_name}`)
      console.log(`  城市: ${chatroom.city} - ${chatroom.district || ''}`)
      console.log(`  中心坐标: ${chatroom.center_lat}, ${chatroom.center_lng}`)
      console.log(`  半径: ${chatroom.radius}m`)
      console.log(`  成员数(表中): ${chatroom.member_count}`)
      console.log(`  成员数(实际): ${chatroom.actual_member_count}`)
      console.log(`  创建时间: ${chatroom.created_at}`)
      
      // 查询聊天室成员
      const membersResult = await pool.query(`
        SELECT m.user_id, m.post_id, u.nickname, p.location_name
        FROM chatroom_members m
        JOIN users u ON m.user_id = u.id
        LEFT JOIN posts p ON m.post_id = p.id
        WHERE m.chatroom_id = $1
      `, [chatroom.id])
      
      console.log(`  成员列表:`)
      membersResult.rows.forEach(member => {
        console.log(`    - ${member.nickname} (用户ID: ${member.user_id}, 帖子ID: ${member.post_id}, 地点: ${member.location_name || '未知'})`)
      })
      
      // 查询聊天室消息数
      const messagesResult = await pool.query(
        'SELECT COUNT(*) as count FROM chatroom_messages WHERE chatroom_id = $1',
        [chatroom.id]
      )
      console.log(`  消息数: ${messagesResult.rows[0].count}`)
      console.log('')
    }
    
    // 分析问题
    console.log('\n🔍 问题分析:\n')
    
    if (nearbyPosts.length > 1 && chatroomsResult.rows.length > 0) {
      const chatroom = chatroomsResult.rows[0]
      const actualMembers = chatroom.actual_member_count
      const expectedMembers = userPostsMap.size
      
      if (actualMembers < expectedMembers) {
        console.log(`⚠️  聊天室成员数不足！`)
        console.log(`   实际成员: ${actualMembers} 人`)
        console.log(`   应有成员: ${expectedMembers} 人 (1km内的用户数)`)
        console.log(`   缺少: ${expectedMembers - actualMembers} 人`)
        console.log('')
        console.log(`💡 可能原因:`)
        console.log(`   1. 聊天室创建时，部分用户的帖子还未发布`)
        console.log(`   2. 聊天室复用逻辑有问题，没有更新成员列表`)
        console.log(`   3. 成员添加逻辑有bug`)
      } else {
        console.log(`✅ 聊天室成员数正常`)
      }
    }
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    console.error(error)
  } finally {
    await pool.end()
  }
}

checkJijimiaoArea()
