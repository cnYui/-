import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function checkChatroomData() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('🔍 检查聊天室数据...\n');

    // 检查夫子庙附近的帖子
    const fuzimiao = await pgQuery(`
      SELECT id, user_id, city, district, location_name, lat, lng, created_at
      FROM posts
      WHERE location_name LIKE '%夫子庙%' OR district LIKE '%夫子庙%'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`📍 夫子庙相关帖子: ${fuzimiao.rows.length} 条`);
    fuzimiao.rows.forEach(post => {
      console.log(`  - ID ${post.id}: ${post.location_name} (用户${post.user_id}) [${post.lat}, ${post.lng}]`);
    });

    // 检查南京的所有帖子
    const nanjing = await pgQuery(`
      SELECT city, district, location_name, COUNT(*) as count
      FROM posts
      WHERE city LIKE '%南京%'
      GROUP BY city, district, location_name
      ORDER BY count DESC
      LIMIT 20
    `);

    console.log(`\n📊 南京地区帖子分布:`);
    nanjing.rows.forEach(row => {
      console.log(`  - ${row.city} ${row.district || ''} ${row.location_name || ''}: ${row.count} 条`);
    });

    // 检查所有聊天室
    const chatrooms = await pgQuery(`
      SELECT id, user_id, chatroom_name, city, district, location_name, 
             center_lat, center_lng, radius, member_count, created_at
      FROM chatrooms
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`\n💬 聊天室列表: ${chatrooms.rows.length} 个`);
    chatrooms.rows.forEach(room => {
      console.log(`  - ID ${room.id}: ${room.chatroom_name} (用户${room.user_id}, ${room.member_count}人)`);
      console.log(`    位置: ${room.city} ${room.district || ''} ${room.location_name || ''}`);
      console.log(`    中心: [${room.center_lat}, ${room.center_lng}], 半径: ${room.radius}m`);
    });

    // 检查聊天室成员
    for (const room of chatrooms.rows) {
      const members = await pgQuery(`
        SELECT m.user_id, u.nickname, m.post_id
        FROM chatroom_members m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.chatroom_id = $1
      `, [room.id]);

      console.log(`\n  聊天室 ${room.id} 的成员 (${members.rows.length}人):`);
      members.rows.forEach(member => {
        console.log(`    - 用户${member.user_id} (${member.nickname || '未知'}), 帖子ID: ${member.post_id}`);
      });
    }

    // 检查用户数量
    const users = await pgQuery('SELECT COUNT(*) as count FROM users');
    console.log(`\n👥 总用户数: ${users.rows[0].count}`);

    // 检查帖子总数
    const posts = await pgQuery('SELECT COUNT(*) as count FROM posts');
    console.log(`📝 总帖子数: ${posts.rows[0].count}`);

    // 检查公开帖子数
    const publicPosts = await pgQuery('SELECT COUNT(*) as count FROM posts WHERE is_public = 1');
    console.log(`🌐 公开帖子数: ${publicPosts.rows[0].count}`);

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkChatroomData();
