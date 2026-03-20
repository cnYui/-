import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function recreateChatroom() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('🔄 重新创建聊天室...\n');

    // 删除聊天室3的所有数据
    console.log('🗑️  删除旧聊天室数据...');
    await pgQuery('DELETE FROM chatroom_messages WHERE chatroom_id = 3');
    console.log('  ✅ 已删除聊天室消息');
    
    await pgQuery('DELETE FROM chatroom_members WHERE chatroom_id = 3');
    console.log('  ✅ 已删除聊天室成员');
    
    await pgQuery('DELETE FROM chatrooms WHERE id = 3');
    console.log('  ✅ 已删除聊天室');

    console.log('\n💡 现在你可以在前端重新发布帖子，系统会自动：');
    console.log('  1. 创建新的聊天室');
    console.log('  2. 匹配夫子庙1km范围内的其他用户');
    console.log('  3. 自动生成AI分身群聊消息');
    console.log('\n或者你可以使用以下API手动触发：');
    console.log('  POST /api/chatrooms/create-by-location');
    console.log('  Body: {');
    console.log('    "postId": 1674,');
    console.log('    "city": "南京",');
    console.log('    "district": null,');
    console.log('    "lat": 32.02066,');
    console.log('    "lng": 118.788899,');
    console.log('    "radius": 1000');
    console.log('  }');

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

recreateChatroom();
