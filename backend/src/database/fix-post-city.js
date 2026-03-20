import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function fixPostCity() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('🔧 修复帖子城市字段...\n');

    // 修复帖子1674的city字段
    await pgQuery(`
      UPDATE posts
      SET city = '南京'
      WHERE id = 1674
    `);

    console.log('✅ 已将帖子1674的city从"未知城市"改为"南京"');

    // 同时修复聊天室3的city字段
    await pgQuery(`
      UPDATE chatrooms
      SET city = '南京'
      WHERE id = 3
    `);

    console.log('✅ 已将聊天室3的city从"未知城市"改为"南京"');

    // 验证修复结果
    const post = await pgQuery('SELECT id, city, location_name FROM posts WHERE id = 1674');
    const chatroom = await pgQuery('SELECT id, city, chatroom_name FROM chatrooms WHERE id = 3');

    console.log('\n📋 修复后的数据:');
    console.log(`  帖子1674: city="${post.rows[0].city}", location="${post.rows[0].location_name}"`);
    console.log(`  聊天室3: city="${chatroom.rows[0].city}", name="${chatroom.rows[0].chatroom_name}"`);

    // 检查现在能匹配到多少用户
    const matches = await pgQuery(`
      SELECT p.id, p.user_id, p.location_name,
             ROUND(
               6371000 * 2 * ASIN(SQRT(
                 POW(SIN((p.lat - 32.02066) * PI() / 180 / 2), 2) +
                 COS(32.02066 * PI() / 180) * COS(p.lat * PI() / 180) *
                 POW(SIN((p.lng - 118.788899) * PI() / 180 / 2), 2)
               ))
             ) as distance
      FROM posts p
      WHERE p.city = '南京' AND p.is_public = 1 AND p.user_id != 53
      AND 6371000 * 2 * ASIN(SQRT(
        POW(SIN((p.lat - 32.02066) * PI() / 180 / 2), 2) +
        COS(32.02066 * PI() / 180) * COS(p.lat * PI() / 180) *
        POW(SIN((p.lng - 118.788899) * PI() / 180 / 2), 2)
      )) <= 1000
      ORDER BY distance
    `);

    console.log(`\n🎯 现在能匹配到 ${matches.rows.length} 个附近用户:`);
    matches.rows.forEach(post => {
      console.log(`  用户${post.user_id}: ${post.location_name} (${post.distance}m)`);
    });

    console.log('\n💡 建议: 删除聊天室3，然后重新发帖，这样会自动拉入附近的用户');

  } catch (error) {
    console.error('❌ 修复失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixPostCity();
