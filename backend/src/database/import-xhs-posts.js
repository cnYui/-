import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = process.env.XHS_CSV_PATH || path.resolve(__dirname, '../../../../MediaCrawler/data/xhs/jsonl/search_contents_image_author_tags_title_content_time_top50_2026-03-19_clean.csv');
const XHS_IMAGES_ROOT = process.env.XHS_IMAGES_ROOT || path.resolve(__dirname, '../../../../MediaCrawler/data/xhs/images');
const RESET_BEFORE_IMPORT = String(process.env.XHS_RESET_BEFORE_IMPORT || 'true').toLowerCase() === 'true';

const CITY_CENTER = {
  南京: { lat: 32.060255, lng: 118.796877 },
  杭州: { lat: 30.274085, lng: 120.15507 },
  上海: { lat: 31.230416, lng: 121.473701 },
  北京: { lat: 39.9042, lng: 116.4074 }
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += ch;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] || '').trim();
    });
    return obj;
  }).filter((r) => r.note_id);
}

function inferCity(row) {
  const merged = `${row.title || ''} ${row.tags || ''}`;
  if (merged.includes('南京')) return '南京';
  if (merged.includes('杭州')) return '杭州';
  if (merged.includes('上海')) return '上海';
  if (merged.includes('北京')) return '北京';
  return '南京';
}

function inferLocationName(row) {
  const title = (row.title || '').replace(/[\r\n]+/g, ' ').trim();
  if (!title) return '旅行地点';
  return title.length > 40 ? `${title.slice(0, 40)}...` : title;
}

function inferMood(row) {
  const source = `${row.title || ''} ${row.tags || ''} ${row.content || ''}`;

  if (/(崩溃|难过|失落|遗憾|泪目|流泪|伤心|emo|心碎|压抑|低落|😭|😢)/i.test(source)) return '悲伤';
  if (/(生气|愤怒|气死|无语|火大|炸裂|吐槽|怒|😠|💢)/i.test(source)) return '愤怒';
  if (/(害怕|恐怖|吓人|惊魂|不敢|后怕|可怕|慎入|鬼|惊悚|😨|😱)/i.test(source)) return '恐惧';
  if (/(累趴|好累|疲惫|暴走|特种兵|通宵|赶路|熬夜|走断腿|腿废了|累麻了|😫)/i.test(source)) return '疲惫';
  if (/(无聊|没意思|发呆|空虚|不知道玩啥|随便逛逛|打发时间|😑)/i.test(source)) return '无聊';
  if (/(踩雷|避雷|人多|排队|堵车|拥挤|焦虑|紧张|慌|赶不上|来不及|怕踩坑|😰)/i.test(source)) return '焦虑';
  if (/(治愈|舒服|温柔|散步|walk|citywalk|轻松|宁静|安静|悠闲|松弛|发呆)/i.test(source)) return '平静';
  if (/(幸福感|幸福|浪漫|甜蜜|满足|圆满|美好一天|被爱|恋爱|纪念日|🥰|❤️)/i.test(source)) return '幸福';
  if (/(一个人|独自|孤独|独处|落单|一个人的旅行|单人散步|😔)/i.test(source)) return '孤独';
  if (/(哇|惊艳|震撼|惊喜|惊讶|绝了|绝美|神了|没想到|居然|居然还有|太绝了|😲)/i.test(source)) return '惊讶';
  if (/(感动|泪目|氛围感|电影感|秋天|梧桐|落日|晚霞|风景|漂亮|值得|封神|浪漫到哭|被治愈|🥺)/i.test(source)) return '感动';
  if (/(攻略|超详细|保姆级|推荐|宝藏|好逛|出片|打卡|冲|必去|值回票价|玩疯了|好玩|太棒了|🤩)/i.test(source)) return '兴奋';
  if (/(开心|快乐|可爱|好吃|好拍|喜欢|满足|玩得开心|笑死|萌|哈哈|🥳|😊|红山动物园|音乐台|景点|旅行|旅游)/i.test(source)) return '开心';

  return '开心';
}

function normalizeTags(row) {
  return (row.tags || '')
    .split(/[|,]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(',');
}

function inferCategory(row) {
  const source = `${row.title || ''} ${row.tags || ''}`;
  if (/(美食|咖啡|奶茶|餐厅|火锅|小吃|甜品|早午餐|吃|饭)/i.test(source)) return '吃';
  if (/(citywalk|街区|拍照|出片|文创|书店|展览|夜市|逛)/i.test(source)) return '逛';
  return '玩';
}

function normalizeContent(content) {
  return String(content || '').replace(/\r\n/g, '\n').trim();
}

function toTimestamp(row) {
  const publishTime = String(row.publish_time || '').trim();
  if (publishTime) {
    const d = new Date(publishTime);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const publishMs = Number(row.publish_time_ms || 0);
  if (Number.isFinite(publishMs) && publishMs > 0) {
    const d = new Date(publishMs);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return new Date().toISOString();
}

function normalizeUsername(author, noteId) {
  const base = String(author || '').trim();
  if (base) return base.slice(0, 80);
  return `xhs_user_${String(noteId || '').slice(-8) || 'unknown'}`;
}

function parseImageFiles(row) {
  const files = (row.image_files || '')
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);

  files.sort((a, b) => {
    const ai = Number((path.basename(a).match(/\d+/) || ['0'])[0]);
    const bi = Number((path.basename(b).match(/\d+/) || ['0'])[0]);
    return ai - bi;
  });

  return files;
}

function toPublicImageUrl(absoluteImagePath, noteId) {
  const file = path.basename(absoluteImagePath);
  return `/xhs-images/${noteId}/${file}`;
}

async function ensureAuthorUser(client, username, createdAt) {
  const found = await client.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [username]);
  if (found.rows.length > 0) return found.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO users (username, nickname, avatar, bio, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [username, username, null, null, createdAt]
  );
  return inserted.rows[0].id;
}

async function clearOldXhsPosts(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      DELETE FROM post_images
      WHERE post_id IN (
        SELECT id FROM posts WHERE source_platform = 'xiaohongshu'
      )
    `);
    await client.query(`DELETE FROM posts WHERE source_platform = 'xiaohongshu'`);
    await client.query('COMMIT');
    console.log('🧹 已清理旧小红书帖子数据');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  const pool = getPgPool();

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV 文件不存在: ${CSV_PATH}`);
  }

  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csv);

  if (!rows.length) {
    throw new Error('CSV 无有效数据');
  }

  console.log(`📥 待导入帖子: ${rows.length} 条`);

  if (RESET_BEFORE_IMPORT) {
    await clearOldXhsPosts(pool);
  }

  let imported = 0;
  let updated = 0;
  const seenNoteIds = new Set();

  for (const row of rows) {
    const noteId = row.note_id;
    if (!noteId || seenNoteIds.has(noteId)) {
      continue;
    }
    seenNoteIds.add(noteId);

    const imageFiles = parseImageFiles(row);
    const imageUrls = imageFiles.map((p) => toPublicImageUrl(p, noteId));

    const city = inferCity(row);
    const locationName = null;
    const mood = inferMood(row);
    const tags = normalizeTags(row);
    const category = inferCategory(row);
    const content = normalizeContent(row.content);
    const title = String(row.title || '').trim() || null;
    const createdAt = toTimestamp(row);
    const username = normalizeUsername(row.author, noteId);
    const center = CITY_CENTER[city] || CITY_CENTER['南京'];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const authorUserId = await ensureAuthorUser(client, username, createdAt);

      const postResult = await client.query(
        `INSERT INTO posts (
           user_id, source_platform, source_note_id, title, content, image_url,
           image_count, image_urls, mood, category, tags, city, district, location_name,
           lat, lng, geo_confidence, is_public, created_at
         ) VALUES (
           $1, 'xiaohongshu', $2, $3, $4, $5,
           $6, $7::jsonb, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, 1, $17
         )
         ON CONFLICT (source_platform, source_note_id)
         DO UPDATE SET
           user_id = EXCLUDED.user_id,
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           image_url = EXCLUDED.image_url,
           image_count = EXCLUDED.image_count,
           image_urls = EXCLUDED.image_urls,
           mood = EXCLUDED.mood,
           category = EXCLUDED.category,
           tags = EXCLUDED.tags,
           city = EXCLUDED.city,
           district = EXCLUDED.district,
           location_name = EXCLUDED.location_name,
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           geo_confidence = EXCLUDED.geo_confidence,
           created_at = EXCLUDED.created_at
         RETURNING id, xmax = 0 AS inserted`,
        [
          authorUserId,
          noteId,
          title,
          content,
          imageUrls[0] || null,
          Math.max(imageUrls.length, imageUrls[0] ? 1 : 0),
          JSON.stringify(imageUrls),
          mood,
          category,
          tags,
          city,
          null,
          locationName,
          center.lat,
          center.lng,
          'city_fallback',
          createdAt
        ]
      );

      const postId = postResult.rows[0].id;
      const inserted = postResult.rows[0].inserted;

      await client.query('DELETE FROM post_images WHERE post_id = $1', [postId]);

      for (let idx = 0; idx < imageUrls.length; idx++) {
        const original = imageFiles[idx] || null;
        await client.query(
          `INSERT INTO post_images (post_id, image_index, image_url, original_path)
           VALUES ($1, $2, $3, $4)`,
          [postId, idx, imageUrls[idx], original]
        );
      }

      await client.query('COMMIT');
      if (inserted) imported += 1;
      else updated += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ 导入失败 note_id=${noteId}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`✅ 导入完成: 新增 ${imported} 条, 更新 ${updated} 条`);
  console.log(`🖼️ 图片根目录: ${XHS_IMAGES_ROOT}`);
}

run()
  .catch((error) => {
    console.error('❌ 小红书导入任务失败:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool();
  });
