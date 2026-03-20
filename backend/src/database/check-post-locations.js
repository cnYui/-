import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function checkPostLocations() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('🔍 检查帖子位置数据...\n');

    // 检查city字段的分布
    const cityDist = await pgQuery(`
      SELECT city, COUNT(*) as count
      FROM posts
      GROUP BY city
      ORDER BY count DESC
    `);

    console.log('📊 城市分布:');
    cityDist.rows.forEach(row => {
      console.log(`  ${row.city}: ${row.count} 条`);
    });

    // 检查一些样本帖子的详细信息
    const samples = await pgQuery(`
      SELECT id, city, district, location_name, lat, lng
      FROM posts
      WHERE id IN (1674, 1261, 1240, 1236, 1087, 1110)
      ORDER BY id
    `);

    console.log('\n📍 样本帖子详情:');
    samples.rows.forEach(post => {
      console.log(`\nID ${post.id}:`);
      console.log(`  城市: ${post.city}`);
      console.log(`  区域: ${post.district || '无'}`);
      console.log(`  地点: ${post.location_name}`);
      console.log(`  坐标: [${post.lat}, ${post.lng}]`);
    });

    // 检查南京夫子庙附近1km的帖子
    const fuzimiao = await pgQuery(`
      SELECT id, user_id, city, location_name, lat, lng,
             ROUND(
               6371000 * 2 * ASIN(SQRT(
                 POW(SIN((lat - 32.02066) * PI() / 180 / 2), 2) +
                 COS(32.02066 * PI() / 180) * COS(lat * PI() / 180) *
                 POW(SIN((lng - 118.788899) * PI() / 180 / 2), 2)
               ))
             ) as distance
      FROM posts
      WHERE 6371000 * 2 * ASIN(SQRT(
        POW(SIN((lat - 32.02066) * PI() / 180 / 2), 2) +
        COS(32.02066 * PI() / 180) * COS(lat * PI() / 180) *
        POW(SIN((lng - 118.788899) * PI() / 180 / 2), 2)
      )) <= 1000
      AND is_public = 1
      ORDER BY distance
      LIMIT 20
    `);

    console.log(`\n🎯 夫子庙1km范围内的帖子: ${fuzimiao.rows.length} 条`);
    fuzimiao.rows.forEach(post => {
      console.log(`  ID ${post.id} (用户${post.user_id}): ${post.location_name} - ${post.distance}m`);
    });

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkPostLocations();
