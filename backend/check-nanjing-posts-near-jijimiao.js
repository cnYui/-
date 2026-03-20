import dotenv from 'dotenv'
import { getPgPool } from './src/database/pg-client.js'

dotenv.config()

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

async function checkNanjingPostsNearJijimiao() {
  const pool = getPgPool()
  
  try {
    // 吉鸡寺坐标
    const jijimiaoLat = 32.061061
    const jijimiaoLng = 118.795246
    
    console.log('🔍 检查南京市内吉鸡寺1km范围内的所有帖子\n')
    console.log(`📍 吉鸡寺坐标: ${jijimiaoLat}, ${jijimiaoLng}\n`)
    
    // 查询南京市的所有公开帖子
    const nanjingPostsResult = await pool.query(`
      SELECT p.id, p.user_id, p.title, p.content, p.location_name, p.city, p.district, p.lat, p.lng, p.is_public, p.created_at,
             u.nickname
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE (p.city LIKE '%南京%' OR p.city = '未知城市') AND p.is_public = 1
      ORDER BY p.created_at DESC
    `)
    
    console.log(`🏙️  南京市(含未知城市)所有公开帖子: ${nanjingPostsResult.rows.length} 条\n`)
    
    // 计算距离
    const nearbyPosts = nanjingPostsResult.rows
      .map(post => ({
        ...post,
        distance: Math.round(calculateDistance(jijimiaoLat, jijimiaoLng, Number(post.lat), Number(post.lng)))
      }))
      .filter(post => post.distance <= 1000)
      .sort((a, b) => a.distance - b.distance)
    
    console.log(`📍 1km内的帖子: ${nearbyPosts.length} 条\n`)
    
    // 按用户分组
    const userPostsMap = new Map()
    nearbyPosts.forEach(post => {
      if (!userPostsMap.has(post.user_id)) {
        userPostsMap.set(post.user_id, {
          nickname: post.nickname,
          posts: []
        })
      }
      userPostsMap.get(post.user_id).posts.push(post)
    })
    
    console.log(`👥 涉及用户数: ${userPostsMap.size} 人\n`)
    
    // 显示详细信息
    for (const [userId, userData] of userPostsMap.entries()) {
      console.log(`用户: ${userData.nickname} (ID: ${userId})`)
      userData.posts.forEach(post => {
        console.log(`  - 帖子 ${post.id}: ${post.location_name || '无地点'} (${post.city}) [距离: ${post.distance}m]`)
        console.log(`    标题: ${post.title || '无标题'}`)
        console.log(`    坐标: ${post.lat}, ${post.lng}`)
      })
      console.log('')
    }
    
    // 检查城市字段问题
    console.log('\n🔍 城市字段分析:\n')
    const cityStats = {}
    nearbyPosts.forEach(post => {
      const city = post.city || '空'
      cityStats[city] = (cityStats[city] || 0) + 1
    })
    
    Object.entries(cityStats).forEach(([city, count]) => {
      console.log(`  ${city}: ${count} 条帖子`)
    })
    
    console.log('\n💡 问题诊断:\n')
    if (cityStats['未知城市'] > 0) {
      console.log(`⚠️  发现 ${cityStats['未知城市']} 条帖子的城市字段为"未知城市"`)
      console.log(`   这会导致聊天室匹配失败，因为代码要求 city 字段完全相同`)
      console.log(`   建议: 将这些帖子的 city 字段修正为"南京市"`)
    }
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    console.error(error)
  } finally {
    await pool.end()
  }
}

checkNanjingPostsNearJijimiao()
