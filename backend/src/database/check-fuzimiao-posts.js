import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function checkFuzimiaoPost() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('🔍 检查夫子庙附近的帖子...\n');

    // 检查两个帖子的详细信息
    const posts = await pgQuery(`
      SELECT p.*, u.nickname
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id IN (1674, 1241)
      ORDER BY p.id
    `);

    console.log('📍 帖子详情:');
    posts.rows.forEach(post => {
      console.log(`\n帖子 ID ${post.id}:`);
      console.log(`  用户: ${post.user_id} (${post.nickname})`);
      console.log(`  城市: ${post.city}`);
      console.log(`  地点: ${post.location_name}`);
      console.log(`  坐标: [${post.lat}, ${post.lng}]`);
      console.log(`  公开: ${post.is_public ? '是' : '否'}`);
      console.log(`  内容: ${(post.content || '').substring(0, 100)}...`);
    });

    // 检查聊天室3的创建逻辑
    const chatroom = await pgQuery(`
      SELECT * FROM chatrooms WHERE id = 3
    `);

    console.log('\n💬 聊天室3详情:');
    const room = chatroom.rows[0];
    console.log(`  名称: ${room.chatroom_name}`);
    console.log(`  城市: ${room.city}`);
    console.log(`  地点: ${room.location_name}`);
    console.log(`  中心: [${room.center_lat}, ${room.center_lng}]`);
    console.log(`  半径: ${room.radius}m`);
    console.log(`  成员数: ${room.member_count}`);

    // 模拟聊天室创建时的匹配逻辑
    console.log('\n🔍 模拟匹配逻辑:');
    console.log(`  触发帖子: ID 1674 (城市="${room.city}")`);
    
    const matchQuery = await pgQuery(`
      SELECT p.id, p.user_id, p.city, p.location_name, p.lat, p.lng, p.is_public,
             ROUND(
               6371000 * 2 * ASIN(SQRT(
                 POW(SIN((p.lat - $1) * PI() / 180 / 2), 2) +
                 COS($1 * PI() / 180) * COS(p.lat * PI() / 180) *
                 POW(SIN((p.lng - $2) * PI() / 180 / 2), 2)
               ))
             ) as distance
      FROM posts p
      WHERE p.city = $3 AND p.is_public = 1 AND p.user_id != $4
      ORDER BY distance
      LIMIT 10
    `, [room.center_lat, room.center_lng, room.city, 53]);

    console.log(`\n  查询条件: city="${room.city}", 排除用户53`);
    console.log(`  结果: ${matchQuery.rows.length} 条帖子`);
    matchQuery.rows.forEach(post => {
      console.log(`    ID ${post.id} (用户${post.user_id}): ${post.location_name} - ${post.distance}m (city="${post.city}")`);
    });

    // 检查如果city字段正确会匹配到什么
    console.log('\n🎯 如果city="南京"会匹配到:');
    const correctMatch = await pgQuery(`
      SELECT p.id, p.user_id, p.city, p.location_name, p.lat, p.lng,
             ROUND(
               6371000 * 2 * ASIN(SQRT(
                 POW(SIN((p.lat - $1) * PI() / 180 / 2), 2) +
                 COS($1 * PI() / 180) * COS(p.lat * PI() / 180) *
                 POW(SIN((p.lng - $2) * PI() / 180 / 2), 2)
               ))
             ) as distance
      FROM posts p
      WHERE p.city = '南京' AND p.is_public = 1 AND p.user_id != 53
      AND 6371000 * 2 * ASIN(SQRT(
        POW(SIN((p.lat - $1) * PI() / 180 / 2), 2) +
        COS($1 * PI() / 180) * COS(p.lat * PI() / 180) *
        POW(SIN((p.lng - $2) * PI() / 180 / 2), 2)
      )) <= 1000
      ORDER BY distance
      LIMIT 10
    `, [32.02066, 118.788899]);

    console.log(`  结果: ${correctMatch.rows.length} 条帖子`);
    correctMatch.rows.forEach(post => {
      console.log(`    ID ${post.id} (用户${post.user_id}): ${post.location_name} - ${post.distance}m`);
    });

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkFuzimiaoPost();
