import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function testPublish() {
  try {
    console.log('🧪 测试发布功能...\n');

    // 模拟登录获取session
    const loginResponse = await axios.post('http://localhost:3001/api/users/login', {
      username: 'test',
      password: 'test123'
    });

    const cookies = loginResponse.headers['set-cookie'];
    console.log('✅ 登录成功');

    // 测试发布
    console.log('\n📤 测试发布记录ID=2...');
    const publishResponse = await axios.post(
      'http://localhost:3001/api/saved-post-records/2/publish',
      {},
      {
        headers: {
          'Cookie': cookies.join('; ')
        }
      }
    );

    console.log('\n✅ 发布响应:');
    console.log(JSON.stringify(publishResponse.data, null, 2));

    if (publishResponse.data.success) {
      const postId = publishResponse.data.data.post.id;
      console.log(`\n✅ 发布成功！帖子ID: ${postId}`);

      // 测试创建聊天室
      console.log('\n💬 测试创建聊天室...');
      const chatroomResponse = await axios.post(
        'http://localhost:3001/api/chatrooms/create-by-location',
        {
          postId: postId,
          city: publishResponse.data.data.post.city,
          district: publishResponse.data.data.post.district,
          lat: publishResponse.data.data.post.lat,
          lng: publishResponse.data.data.post.lng,
          radius: 1000
        },
        {
          headers: {
            'Cookie': cookies.join('; ')
          }
        }
      );

      console.log('\n✅ 聊天室响应:');
      console.log(JSON.stringify(chatroomResponse.data, null, 2));
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testPublish();
