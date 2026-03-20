import dotenv from 'dotenv';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function exportPostsData() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('📊 开始导出小红书贴文数据...\n');

    // 查询贴文数据及关联的用户信息
    const postsQuery = `
      SELECT 
        p.id,
        p.user_id,
        u.username,
        u.nickname,
        p.content,
        p.image_url,
        p.mood,
        p.city,
        p.district,
        p.location_name,
        p.lat,
        p.lng,
        p.is_public,
        p.created_at,
        p.plan_id
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `;

    const result = await pgQuery(postsQuery);
    const posts = result.rows;

    console.log(`✅ 查询到 ${posts.length} 条贴文数据\n`);

    // 生成可读的文本报告
    let report = '# 小红书贴文数据审查报告\n\n';
    report += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    report += `总贴文数: ${posts.length}\n\n`;
    report += '---\n\n';

    posts.forEach((post, index) => {
      report += `## 贴文 #${index + 1} (ID: ${post.id})\n\n`;
      report += `- **用户**: ${post.nickname || '未知'} (@${post.username || '未知'}) [用户ID: ${post.user_id}]\n`;
      report += `- **发布时间**: ${new Date(post.created_at).toLocaleString('zh-CN')}\n`;
      report += `- **位置**: ${post.city || '未知'}${post.district ? ' - ' + post.district : ''}${post.location_name ? ' - ' + post.location_name : ''}\n`;
      report += `- **坐标**: 纬度 ${post.lat}, 经度 ${post.lng}\n`;
      report += `- **心情**: ${post.mood || '无'}\n`;
      report += `- **公开状态**: ${post.is_public ? '公开' : '私密'}\n`;
      report += `- **图片**: ${post.image_url || '无'}\n`;
      report += `- **关联旅行计划ID**: ${post.plan_id || '无'}\n\n`;
      report += `**内容**:\n\`\`\`\n${post.content || '(无内容)'}\n\`\`\`\n\n`;
      report += '---\n\n';
    });

    // 生成 JSON 格式的完整数据
    const jsonData = {
      exportTime: new Date().toISOString(),
      totalCount: posts.length,
      posts: posts.map(post => ({
        id: post.id,
        userId: post.user_id,
        username: post.username,
        nickname: post.nickname,
        content: post.content,
        imageUrl: post.image_url,
        mood: post.mood,
        location: {
          city: post.city,
          district: post.district,
          locationName: post.location_name,
          lat: post.lat,
          lng: post.lng
        },
        isPublic: post.is_public === 1,
        planId: post.plan_id,
        createdAt: post.created_at
      }))
    };

    // 统计信息
    const stats = {
      totalPosts: posts.length,
      publicPosts: posts.filter(p => p.is_public === 1).length,
      privatePosts: posts.filter(p => p.is_public === 0).length,
      postsWithImages: posts.filter(p => p.image_url).length,
      postsWithMood: posts.filter(p => p.mood).length,
      citiesCount: new Set(posts.map(p => p.city).filter(Boolean)).size,
      uniqueUsers: new Set(posts.map(p => p.user_id)).size
    };

    report += `## 统计信息\n\n`;
    report += `- 总贴文数: ${stats.totalPosts}\n`;
    report += `- 公开贴文: ${stats.publicPosts}\n`;
    report += `- 私密贴文: ${stats.privatePosts}\n`;
    report += `- 包含图片: ${stats.postsWithImages}\n`;
    report += `- 包含心情: ${stats.postsWithMood}\n`;
    report += `- 涉及城市数: ${stats.citiesCount}\n`;
    report += `- 发帖用户数: ${stats.uniqueUsers}\n`;

    // 保存文件
    const outputDir = path.join(__dirname, '../..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const reportPath = path.join(outputDir, `xhs-posts-review-${timestamp}.md`);
    const jsonPath = path.join(outputDir, `xhs-posts-data-${timestamp}.json`);

    fs.writeFileSync(reportPath, report, 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');

    console.log('✅ 导出完成！\n');
    console.log(`📄 审查报告: ${reportPath}`);
    console.log(`📋 JSON数据: ${jsonPath}\n`);
    console.log('统计信息:');
    console.log(`  - 总贴文数: ${stats.totalPosts}`);
    console.log(`  - 公开/私密: ${stats.publicPosts}/${stats.privatePosts}`);
    console.log(`  - 包含图片: ${stats.postsWithImages}`);
    console.log(`  - 涉及城市: ${stats.citiesCount}`);
    console.log(`  - 发帖用户: ${stats.uniqueUsers}`);

  } catch (error) {
    console.error('❌ 导出失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

exportPostsData();
