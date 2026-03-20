import { pgQuery } from './src/database/pg-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testPublish() {
  try {
    console.log('🧪 测试发布功能...\n');

    // 检查保存记录
    const records = await pgQuery('SELECT * FROM saved_post_records ORDER BY id DESC LIMIT 5');
    console.log(`📋 保存记录列表: ${records.rows.length} 条\n`);
    
    records.rows.forEach(record => {
      console.log(`记录 ID ${record.id}:`);
      console.log(`  标题: ${record.title}`);
      console.log(`  城市: ${record.city}`);
      console.log(`  地点: ${record.location_name}`);
      console.log(`  已发布: ${record.published_post_id ? '是 (帖子ID: ' + record.published_post_id + ')' : '否'}`);
      console.log('');
    });

    // 检查最新的帖子
    const posts = await pgQuery('SELECT * FROM posts ORDER BY id DESC LIMIT 5');
    console.log(`📝 最新帖子: ${posts.rows.length} 条\n`);
    
    posts.rows.forEach(post => {
      console.log(`帖子 ID ${post.id}:`);
      console.log(`  用户: ${post.user_id}`);
      console.log(`  标题: ${post.title || '无'}`);
      console.log(`  城市: ${post.city}`);
      console.log(`  地点: ${post.location_name}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

testPublish();
