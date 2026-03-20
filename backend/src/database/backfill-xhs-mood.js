import dotenv from 'dotenv';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

function inferMoodFromText(text = '') {
  const source = String(text || '');

  if (/(崩溃|难过|失落|遗憾|泪目|流泪|伤心|emo|心碎|压抑|低落|😭|😢)/i.test(source)) return '悲伤';
  if (/(生气|愤怒|气死|无语|火大|炸裂|吐槽|怒|😠|💢)/i.test(source)) return '愤怒';
  if (/(害怕|恐怖|吓人|惊魂|不敢|后怕|可怕|慎入|鬼|惊悚|😨|😱)/i.test(source)) return '恐惧';
  if (/(累趴|好累|疲惫|暴走|特种兵|通宵|赶路|熬夜|走断腿|腿废了|累麻了|😫)/i.test(source)) return '疲惫';
  if (/(无聊|没意思|发呆|空虚|不知道玩啥|随便逛逛|打发时间|😑)/i.test(source)) return '无聊';
  if (/(踩雷|避雷|热|人多|排队|堵|拥挤|焦虑|紧张|慌|赶不上|来不及|怕踩坑|😰)/i.test(source)) return '焦虑';
  if (/(治愈|舒服|温柔|散步|walk|citywalk|轻松|宁静|安静|悠闲|松弛|发呆)/i.test(source)) return '平静';
  if (/(幸福感|幸福|浪漫|甜蜜|满足|圆满|美好一天|被爱|恋爱|纪念日|🥰|❤️)/i.test(source)) return '幸福';
  if (/(一个人|独自|孤独|独处|落单|一个人的旅行|单人散步|😔)/i.test(source)) return '孤独';
  if (/(哇|惊艳|震撼|惊喜|惊讶|绝了|绝美|神了|没想到|居然|居然还有|太绝了|😲)/i.test(source)) return '惊讶';
  if (/(感动|泪目|氛围感|电影感|秋天|梧桐|落日|晚霞|风景|漂亮|值得|封神|浪漫到哭|被治愈|🥺)/i.test(source)) return '感动';
  if (/(攻略|超详细|保姆级|推荐|宝藏|好逛|出片|打卡|冲|必去|值回票价|玩疯了|好玩|太棒了|🤩)/i.test(source)) return '兴奋';
  if (/(开心|快乐|可爱|好吃|好拍|喜欢|满足|玩得开心|笑死|萌|哈哈|🥳|😊|红山动物园|音乐台|景点|旅行|旅游)/i.test(source)) return '开心';

  return '开心';
}

async function run() {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const before = await client.query(
      `SELECT COALESCE(mood, '(null)') AS mood, COUNT(*)::int AS c
       FROM posts
       WHERE source_platform = 'xiaohongshu'
       GROUP BY 1
       ORDER BY c DESC, mood`
    );

    const rows = await client.query(
      `SELECT id, title, content, tags, mood
       FROM posts
       WHERE source_platform = 'xiaohongshu'
       ORDER BY id ASC`
    );

    for (const row of rows.rows) {
      const source = `${row.title || ''} ${row.tags || ''} ${row.content || ''}`;
      const mood = inferMoodFromText(source);
      await client.query('UPDATE posts SET mood = $1 WHERE id = $2', [mood, row.id]);
    }

    const after = await client.query(
      `SELECT COALESCE(mood, '(null)') AS mood, COUNT(*)::int AS c
       FROM posts
       WHERE source_platform = 'xiaohongshu'
       GROUP BY 1
       ORDER BY c DESC, mood`
    );

    const sample221 = await client.query(
      `SELECT id, source_note_id, title, mood
       FROM posts
       WHERE id = 221
       LIMIT 1`
    );

    console.log(JSON.stringify({
      beforeDistribution: before.rows,
      updatedRows: rows.rows.length,
      afterDistribution: after.rows,
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
