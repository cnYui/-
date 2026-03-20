import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function deletePost(postId) {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log(`🗑️  准备删除贴文 ID: ${postId}...\n`);

    // 先查询贴文信息
    const selectQuery = 'SELECT * FROM posts WHERE id = $1';
    const selectResult = await pgQuery(selectQuery, [postId]);

    if (selectResult.rows.length === 0) {
      console.log(`⚠️  贴文 ID ${postId} 不存在`);
      return;
    }

    const post = selectResult.rows[0];
    console.log('📋 贴文信息:');
    console.log(`   用户ID: ${post.user_id}`);
    console.log(`   内容: ${post.content?.substring(0, 50) || '(无内容)'}...`);
    console.log(`   位置: ${post.city} - ${post.district} - ${post.location_name}`);
    console.log(`   创建时间: ${post.created_at}\n`);

    // 删除贴文
    const deleteQuery = 'DELETE FROM posts WHERE id = $1';
    await pgQuery(deleteQuery, [postId]);

    console.log(`✅ 贴文 ID ${postId} 已成功删除！`);

  } catch (error) {
    console.error('❌ 删除失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 从命令行参数获取贴文ID
const postId = process.argv[2];

if (!postId) {
  console.error('❌ 请提供贴文ID');
  console.log('用法: node delete-post.js <贴文ID>');
  process.exit(1);
}

deletePost(parseInt(postId));
