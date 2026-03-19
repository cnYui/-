import dotenv from 'dotenv';
import axios from 'axios';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY;
const STEPFUN_BASE_URL = process.env.STEPFUN_BASE_URL || 'https://api.stepfun.com/v1';
const LLM_MODEL = process.env.STEPFUN_TEXT_MODEL || 'step-3.5-flash';

const REQUEST_TIMEOUT_MS = Math.max(60000, Number(process.env.XHS_GUIDES_LLM_TIMEOUT_MS || 180000));
const REQUEST_RETRY = Math.max(1, Number(process.env.XHS_GUIDES_LLM_RETRY || 4));
const REFINE_LIMIT = Math.max(1, Number(process.env.XHS_DB_LOCATION_REFINE_LIMIT || 500));
const REQUEST_INTERVAL_MS = Math.max(200, Number(process.env.XHS_DB_LOCATION_REFINE_INTERVAL_MS || 800));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanJsonText(raw) {
  return String(raw || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function parseAssistantJson(raw) {
  const cleaned = cleanJsonText(raw);
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function getAssistantText(data) {
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

function buildPrompt(post) {
  const content = String(post?.content || '').slice(0, 1800);

  return `你是“地点清洗与地理编码预处理”助手。请根据单帖信息，识别一个最适合高德地理编码的“具体地点名”。

请严格输出 JSON，不要输出 markdown。结构必须是：
{
  "resolvedLocationName": "字符串，尽量具体的地点名（店名/景点名/商圈+店名）",
  "resolvedCity": "字符串，城市名",
  "confidence": 0.0,
  "reason": "一句话解释"
}

规则：
1) 必须结合 city、title、content 共同判断。
2) 优先具体地点，不要只输出城市名。
3) 若无法确认具体地点，输出空字符串给 resolvedLocationName。
4) 若文本明确指向异地，应修正 resolvedCity（如凌波门->武汉）。

输入：
- id: ${post?.id || ''}
- sourceNoteId: ${post?.source_note_id || ''}
- city: ${post?.city || ''}
- title: ${post?.title || ''}
- content: ${content}`;
}

async function callStepfun(payload) {
  if (!STEPFUN_API_KEY) {
    throw new Error('缺少 STEPFUN_API_KEY，无法执行地点精抽取');
  }

  const response = await axios.post(`${STEPFUN_BASE_URL}/chat/completions`, payload, {
    headers: {
      Authorization: `Bearer ${STEPFUN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: REQUEST_TIMEOUT_MS
  });

  return response.data;
}

async function callStepfunWithRetry(payload, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= REQUEST_RETRY; attempt += 1) {
    try {
      return await callStepfun(payload);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const detail = error.response?.data || error.message;
      const detailText = JSON.stringify(detail);
      console.error(`❌ ${label} 失败（第 ${attempt}/${REQUEST_RETRY} 次）:`, detailText);

      if (attempt < REQUEST_RETRY && /limited concurrency reached/i.test(detailText)) {
        await sleep(20000 * attempt);
        continue;
      }

      if (attempt < REQUEST_RETRY && (status === 429 || status >= 500 || !status)) {
        await sleep(3000 * attempt);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

async function run() {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const rows = await client.query(
      `SELECT id, source_note_id, city, title, content
       FROM posts
       WHERE source_platform = 'xiaohongshu'
         AND (geo_confidence IS NULL OR geo_confidence <> 'amap_geocode')
         AND (location_name IS NULL OR location_name = '')
       ORDER BY created_at DESC
       LIMIT $1`,
      [REFINE_LIMIT]
    );

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.rows.length; i += 1) {
      const post = rows.rows[i];
      const label = `post_id=${post.id} note_id=${post.source_note_id || ''}`;
      console.log(`🔍 [${i + 1}/${rows.rows.length}] ${label}`);

      try {
        const response = await callStepfunWithRetry({
          model: LLM_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是地理位置结构化助手，必须输出严格 JSON。'
            },
            {
              role: 'user',
              content: buildPrompt(post)
            }
          ],
          temperature: 0.1
        }, label);

        const parsed = parseAssistantJson(getAssistantText(response)) || {};
        const locationName = String(parsed?.resolvedLocationName || '').trim();
        const resolvedCity = String(parsed?.resolvedCity || '').trim();

        if (!locationName) {
          skipped += 1;
          await sleep(REQUEST_INTERVAL_MS);
          continue;
        }

        await client.query(
          `UPDATE posts
           SET location_name = $1,
               city = COALESCE(NULLIF($2, ''), city),
               geo_confidence = 'city_fallback'
           WHERE id = $3`,
          [locationName, resolvedCity, post.id]
        );

        updated += 1;
      } catch (error) {
        failed += 1;
        console.warn(`⚠️ StepFun 抽取失败 ${label}: ${error.message}`);
      }

      await sleep(REQUEST_INTERVAL_MS);
    }

    console.log(JSON.stringify({
      model: LLM_MODEL,
      queried: rows.rows.length,
      updated,
      skipped,
      failed
    }, null, 2));
  } finally {
    client.release();
    await closePgPool();
  }
}

run().catch((error) => {
  console.error('❌ 数据库地点精抽取失败:', error.message);
  process.exitCode = 1;
});
