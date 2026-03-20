import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function checkSavedRecords() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('🔍 检查保存记录数据...\n');

    // 检查所有保存记录
    const records = await pgQuery(`
      SELECT id, user_id, title, city, district, location_name, 
             lat, lng, mood, generation_status, published_post_id,
             original_image_url, generated_image_url, created_at
      FROM saved_post_records
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`📋 保存记录列表: ${records.rows.length} 条\n`);
    records.rows.forEach(record => {
      console.log(`记录 ID ${record.id}:`);
      console.log(`  用户: ${record.user_id}`);
      console.log(`  标题: ${record.title}`);
      console.log(`  城市: ${record.city || '未设置'}`);
      console.log(`  地点: ${record.location_name || '未设置'}`);
      console.log(`  坐标: [${record.lat}, ${record.lng}]`);
      console.log(`  心情: ${record.mood || '未设置'}`);
      console.log(`  生成状态: ${record.generation_status}`);
      console.log(`  已发布: ${record.published_post_id ? '是 (帖子ID: ' + record.published_post_id + ')' : '否'}`);
      console.log(`  原图: ${record.original_image_url ? '有' : '无'}`);
      console.log(`  生成图: ${record.generated_image_url ? '有' : '无'}`);
      console.log('');
    });

    // 检查是否有city为空或未知的记录
    const invalidCity = await pgQuery(`
      SELECT COUNT(*) as count
      FROM saved_post_records
      WHERE city IS NULL OR city = '' OR city = '未知城市'
    `);

    console.log(`⚠️  城市信息无效的记录: ${invalidCity.rows[0].count} 条`);

    // 检查是否有坐标为0的记录
    const invalidCoords = await pgQuery(`
      SELECT COUNT(*) as count
      FROM saved_post_records
      WHERE lat = 0 OR lng = 0 OR lat IS NULL OR lng IS NULL
    `);

    console.log(`⚠️  坐标信息无效的记录: ${invalidCoords.rows[0].count} 条`);

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkSavedRecords();
