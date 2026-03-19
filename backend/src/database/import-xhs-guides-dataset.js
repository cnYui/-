import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_GUIDES_DIR = process.env.XHS_TRAVEL_INTEL_OUTPUT_DIR || path.resolve(__dirname, '../../output/xhs-location-guides');
const DATASET_PATH = process.env.XHS_GUIDES_DATASET_OUTPUT || path.join(DEFAULT_GUIDES_DIR, 'xhs_posts_dataset.json');

function parseMaybeJson(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniqueStrings(items) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    const value = String(item || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function inferCategory(text = '') {
  const source = String(text || '');
  if (/(美食|咖啡|奶茶|餐厅|火锅|小吃|甜品|早午餐|吃|饭)/i.test(source)) return '吃';
  if (/(citywalk|街区|拍照|出片|文创|书店|展览|夜市|逛)/i.test(source)) return '逛';
  return '玩';
}

function toIsoTime(value) {
  const d = new Date(String(value || '').trim());
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

async function ensureFallbackUser(client) {
  const username = 'xhs_sync_bot';
  const found = await client.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [username]);
  if (found.rows.length > 0) return found.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO users (username, nickname, avatar, bio)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [username, 'xhs_sync_bot', null, '用于小红书数据同步']
  );

  return inserted.rows[0].id;
}

async function upsertPostByDataset(client, item, fallbackUserId) {
  const noteId = String(item?.sourceNoteId || item?.noteId || '').trim();
  if (!noteId) return { skipped: true };

  const imageUrls = uniqueStrings(Array.isArray(item?.imageUrls) ? item.imageUrls : []);
  const imageUrl = imageUrls[0] || (item?.imageUrl || null);

  const title = String(item?.title || '').trim() || null;
  const content = String(item?.content || '').trim() || '';
  const mood = String(item?.mood || '').trim() || '开心';
  const city = String(item?.city || '').trim() || '南京';
  const district = String(item?.district || '').trim() || null;
  const locationName = String(item?.locationName || '').trim() || city;
  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  const createdAt = toIsoTime(item?.visitTime || item?.createdAt);
  const category = item?.category || inferCategory(`${title || ''} ${content || ''}`);
  const tags = item?.tags || null;
  const userId = Number(item?.userId) || fallbackUserId;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { skipped: true, noteId, reason: 'invalid_lat_lng' };
  }

  const postResult = await client.query(
    `INSERT INTO posts (
       user_id, source_platform, source_note_id, title, content,
       image_url, image_count, image_urls, mood, category, tags,
       city, district, location_name, lat, lng, geo_confidence, is_public, created_at
     ) VALUES (
       $1, 'xiaohongshu', $2, $3, $4,
       $5, $6, $7::jsonb, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, 1, $17
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
      userId,
      noteId,
      title,
      content,
      imageUrl,
      imageUrls.length,
      JSON.stringify(imageUrls),
      mood,
      category,
      tags,
      city,
      district,
      locationName,
      lat,
      lng,
      'llm_location_dedup',
      createdAt
    ]
  );

  const postId = postResult.rows[0].id;
  const inserted = postResult.rows[0].inserted;

  await client.query('DELETE FROM post_images WHERE post_id = $1', [postId]);

  for (let idx = 0; idx < imageUrls.length; idx += 1) {
    await client.query(
      `INSERT INTO post_images (post_id, image_index, image_url, original_path)
       VALUES ($1, $2, $3, $4)`,
      [postId, idx, imageUrls[idx], null]
    );
  }

  return { skipped: false, inserted, noteId, postId };
}

async function run() {
  if (!fs.existsSync(DATASET_PATH)) {
    throw new Error(`汇总文件不存在: ${DATASET_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const posts = Array.isArray(raw?.posts) ? raw.posts : [];

  if (!posts.length) {
    throw new Error('汇总文件中没有 posts 数据');
  }

  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const fallbackUserId = await ensureFallbackUser(client);

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < posts.length; i += 1) {
      const item = posts[i];
      const result = await upsertPostByDataset(client, item, fallbackUserId);

      if (result.skipped) {
        skippedCount += 1;
        console.warn(`⚠️ [${i + 1}/${posts.length}] 跳过 note_id=${result.noteId || 'unknown'} ${result.reason || ''}`);
        continue;
      }

      if (result.inserted) insertedCount += 1;
      else updatedCount += 1;

      console.log(`✅ [${i + 1}/${posts.length}] 同步 note_id=${result.noteId} -> post_id=${result.postId}`);
    }

    await client.query('COMMIT');

    console.log(`🎉 入库完成: 新增 ${insertedCount}，更新 ${updatedCount}，跳过 ${skippedCount}`);
    console.log(`📄 来源文件: ${DATASET_PATH}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePgPool();
  }
}

run().catch((error) => {
  console.error('❌ 汇总入库失败:', error.message);
  process.exitCode = 1;
});
