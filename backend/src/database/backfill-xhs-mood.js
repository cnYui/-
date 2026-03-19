import dotenv from 'dotenv';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

function inferMoodFromText(text = '') {
  const source = String(text || '');

  if (/(治愈|舒服|温柔|散步|walk|citywalk|幸福|轻松|宁静)/i.test(source)) return '平静';
  if (/(攻略|超详细|保姆级|推荐|宝藏|好逛|出片|打卡)/i.test(source)) return '兴奋';
  if (/(秋天|梧桐|风景|漂亮|氛围|电影感)/i.test(source)) return '感动';
  if (/(红山动物园|音乐台|景点|旅行|旅游)/i.test(source)) return '开心';
  if (/(锐评|踩雷|避雷|热|人多)/i.test(source)) return '焦虑';

  return '开心';
}

async function run() {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const before = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM posts
       WHERE source_platform = 'xiaohongshu' AND (mood IS NULL OR mood = '')`
    );

    const rows = await client.query(
      `SELECT id, title, content, tags
       FROM posts
       WHERE source_platform = 'xiaohongshu' AND (mood IS NULL OR mood = '')
       ORDER BY id ASC`
    );

    for (const row of rows.rows) {
      const source = `${row.title || ''} ${row.tags || ''} ${row.content || ''}`;
      const mood = inferMoodFromText(source);
      await client.query('UPDATE posts SET mood = $1 WHERE id = $2', [mood, row.id]);
    }

    const after = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM posts
       WHERE source_platform = 'xiaohongshu' AND (mood IS NULL OR mood = '')`
    );

    const sample221 = await client.query(
      `SELECT id, source_note_id, title, mood
       FROM posts
       WHERE id = 221
       LIMIT 1`
    );

    console.log(JSON.stringify({
      beforeNullMood: before.rows[0]?.c || 0,
      updatedRows: rows.rows.length,
      afterNullMood: after.rows[0]?.c || 0,
      post221: sample221.rows[0] || null
    }, null, 2));
  } finally {
    client.release();
    await closePgPool();
  }
}

run().catch((error) => {
  console.error('❌ 回填 mood 失败:', error.message);
  process.exitCode = 1;
});
