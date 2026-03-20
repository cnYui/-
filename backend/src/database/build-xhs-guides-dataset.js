import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GUIDES_DIR = process.env.XHS_TRAVEL_INTEL_OUTPUT_DIR || path.resolve(__dirname, '../../output/xhs-location-guides');
const OUTPUT_FILE = process.env.XHS_GUIDES_DATASET_OUTPUT || path.join(GUIDES_DIR, 'xhs_posts_dataset.json');
const NOTE_IDS_FILE = process.env.XHS_GUIDES_NOTE_IDS_FILE || '';
const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY;
const STEPFUN_BASE_URL = process.env.STEPFUN_BASE_URL || 'https://api.stepfun.com/v1';
const LLM_MODEL = process.env.STEPFUN_TEXT_MODEL || 'step-3.5-flash';
const LLM_TIMEOUT_MS = Math.max(60000, Number(process.env.XHS_GUIDES_LLM_TIMEOUT_MS || 180000));
const REQUEST_RETRY = Math.max(1, Number(process.env.XHS_GUIDES_LLM_RETRY || 4));
const LIMIT = Math.max(1, Number(process.env.XHS_GUIDES_BUILD_LIMIT || 200));

const MOOD_OPTIONS = ['开心', '兴奋', '平静', '感动', '惊讶', '悲伤', '愤怒', '焦虑', '疲惫', '无聊', '恐惧', '幸福', '孤独'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeReadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadNoteIdFilter(filePath) {
  const target = String(filePath || '').trim();
  if (!target) return null;

  const payload = safeReadJson(target, null);
  if (!payload) return null;

  const noteIds = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.noteIds)
      ? payload.noteIds
      : [];

  const normalized = noteIds
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return normalized.length ? new Set(normalized) : null;
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

function parseMaybeJson(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

function toTimestampLike(value) {
  const t = String(value || '').trim();
  if (!t) return new Date().toISOString();
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function inferMoodFallback(title, content, summary) {
  const source = `${title || ''}\n${content || ''}\n${summary || ''}`;

  if (/(崩溃|难过|失落|遗憾|泪目|流泪|伤心|emo|心碎|压抑|低落|😭|😢)/i.test(source)) return '悲伤';
  if (/(生气|愤怒|气死|无语|火大|炸裂|吐槽|怒|😠|💢)/i.test(source)) return '愤怒';
  if (/(害怕|恐怖|吓人|惊魂|不敢|后怕|可怕|慎入|鬼|惊悚|😨|😱)/i.test(source)) return '恐惧';
  if (/(累趴|好累|疲惫|暴走|特种兵|通宵|赶路|熬夜|走断腿|腿废了|累麻了|😫)/i.test(source)) return '疲惫';
  if (/(无聊|没意思|发呆|空虚|不知道玩啥|随便逛逛|打发时间|😑)/i.test(source)) return '无聊';
  if (/(踩雷|避雷|热|人多|排队|堵|拥挤|焦虑|紧张|慌|赶不上|来不及|怕踩坑|😰)/i.test(source)) return '焦虑';
  if (/(治愈|舒服|温柔|散步|citywalk|轻松|宁静|安静|悠闲|松弛|发呆)/i.test(source)) return '平静';
  if (/(幸福感|幸福|浪漫|甜蜜|满足|圆满|美好一天|被爱|恋爱|纪念日|🥰|❤️)/i.test(source)) return '幸福';
  if (/(一个人|独自|孤独|独处|落单|一个人的旅行|单人散步|😔)/i.test(source)) return '孤独';
  if (/(哇|惊艳|震撼|惊喜|惊讶|绝了|绝美|神了|没想到|居然|居然还有|太绝了|😲)/i.test(source)) return '惊讶';
  if (/(感动|泪目|氛围感|电影感|秋天|梧桐|落日|晚霞|风景|漂亮|值得|封神|浪漫到哭|被治愈|🥺)/i.test(source)) return '感动';
  if (/(攻略|超详细|保姆级|推荐|宝藏|好逛|出片|打卡|必去|冲|值回票价|玩疯了|好玩|太棒了|🤩)/i.test(source)) return '兴奋';
  if (/(开心|快乐|可爱|好吃|好拍|喜欢|满足|玩得开心|笑死|萌|哈哈|🥳|😊|红山动物园|景点|旅行|旅游|度假|海边|咖啡)/i.test(source)) return '开心';

  return '开心';
}

function collectLocationCandidates(textResult, imageResult) {
  const fromText = Array.isArray(textResult?.locationGuides) ? textResult.locationGuides : [];
  const fromImage = Array.isArray(imageResult?.locationGuides) ? imageResult.locationGuides : [];

  return [...fromText, ...fromImage]
    .map((item) => ({
      name: String(item?.location || '').trim(),
      city: String(item?.city || '').trim(),
      suggestions: uniqueStrings(Array.isArray(item?.suggestions) ? item.suggestions : []),
      evidence: uniqueStrings(Array.isArray(item?.evidence) ? item.evidence : [])
    }))
    .filter((item) => item.name);
}

function dedupeCandidatesFallback(candidates) {
  const map = new Map();

  for (const item of candidates) {
    const key = `${item.name.toLowerCase()}__${item.city.toLowerCase()}`;
    const current = map.get(key) || {
      name: item.name,
      city: item.city,
      suggestions: [],
      evidence: []
    };
    current.suggestions = uniqueStrings([...current.suggestions, ...item.suggestions]);
    current.evidence = uniqueStrings([...current.evidence, ...item.evidence]);
    map.set(key, current);
  }

  return Array.from(map.values());
}

function buildDedupPrompt(post, candidates) {
  const lines = candidates.map((item, idx) => (
    `${idx + 1}. 地点=${item.name}；城市=${item.city || '未知'}；建议=${item.suggestions.join(' | ') || '无'}；证据=${item.evidence.join(' | ') || '无'}`
  ));

  return `你是旅行数据清洗助手。请针对单篇帖子做“地点去重 + 主地点识别 + 心情判断”。\n\n请严格输出 JSON，不要输出 markdown，结构必须是：\n{\n  "dedupedLocations": [\n    {\n      "name": "地点名称",\n      "city": "城市名，没有就空字符串",\n      "suggestions": ["建议1"],\n      "evidence": ["证据片段1"]\n    }\n  ],\n  "primaryLocation": "该帖最适合作为发帖地理位置的地点名",\n  "primaryCity": "主地点城市名，没有就空字符串",\n  "mood": "开心|兴奋|平静|感动|惊讶|悲伤|愤怒|焦虑|疲惫|无聊|恐惧|幸福|孤独",\n  "reason": "简短理由"\n}\n\n要求：\n1) 按地点名称去重，保留建议和证据。\n2) primaryLocation 必须是可 geocode 的具体地点锚点，优先：古镇/景区/公园/商圈/街区/湖/寺/桥/市场/地铁站。\n3) 禁止把 primaryLocation 输出成城市名或标题泛词（如“无锡”“杭州”“上海”“无锡旅游攻略”）。\n4) 若候选包含多个地点，优先选最能代表整帖的区域级锚点地点，不要优先单店。\n5) 仅当整帖明显围绕一家店/一个场馆时，才可输出单店名。\n6) primaryCity 必须与 primaryLocation 同城，禁止跨城。\n7) mood 必须是给定枚举之一。\n\n帖子信息：\n- note_id: ${post.noteId}\n- title: ${post.title || ''}\n- content: ${(post.content || '').slice(0, 1600)}\n- city: ${post.city || ''}\n- created_at: ${post.createdAt || ''}\n\n候选地点：\n${lines.length ? lines.join('\n') : '无（请根据标题和正文自行判断一个主地点）'}`;
}

async function callStepfun(payload) {
  if (!STEPFUN_API_KEY) {
    throw new Error('缺少 STEPFUN_API_KEY，无法执行地点去重');
  }

  const response = await axios.post(`${STEPFUN_BASE_URL}/chat/completions`, payload, {
    headers: {
      Authorization: `Bearer ${STEPFUN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: LLM_TIMEOUT_MS
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

function normalizeLlmResult(parsed, fallbackCandidates, fallbackMood) {
  const deduped = Array.isArray(parsed?.dedupedLocations)
    ? parsed.dedupedLocations.map((item) => ({
        name: String(item?.name || '').trim(),
        city: String(item?.city || '').trim(),
        suggestions: uniqueStrings(Array.isArray(item?.suggestions) ? item.suggestions : []),
        evidence: uniqueStrings(Array.isArray(item?.evidence) ? item.evidence : [])
      })).filter((item) => item.name)
    : [];

  const locations = deduped.length ? deduped : dedupeCandidatesFallback(fallbackCandidates);

  const first = locations[0] || { name: '', city: '' };
  const primaryLocation = String(parsed?.primaryLocation || '').trim() || first.name;
  const primaryCity = String(parsed?.primaryCity || '').trim() || first.city;
  const mood = String(parsed?.mood || '').trim();

  return {
    locations,
    primaryLocation,
    primaryCity,
    mood: MOOD_OPTIONS.includes(mood) ? mood : fallbackMood,
    reason: String(parsed?.reason || '').trim()
  };
}

async function loadPostByNoteId(pool, noteId) {
  const postResult = await pool.query(
    `SELECT id, user_id, source_platform, source_note_id, title, content, image_url, image_urls,
            mood, category, tags, city, district, location_name, lat, lng, created_at
     FROM posts
     WHERE source_platform = 'xiaohongshu' AND source_note_id = $1
     LIMIT 1`,
    [noteId]
  );

  if (postResult.rows.length === 0) return null;

  const post = postResult.rows[0];

  const imageRows = await pool.query(
    `SELECT image_url
     FROM post_images
     WHERE post_id = $1
     ORDER BY image_index ASC`,
    [post.id]
  );

  const imageUrls = imageRows.rows.map((item) => item.image_url).filter(Boolean);
  const fromPostJson = parseMaybeJson(post.image_urls, []);

  return {
    ...post,
    image_urls: imageUrls.length ? imageUrls : fromPostJson
  };
}

function buildGlobalLocationIndex(posts) {
  const map = new Map();

  for (const post of posts) {
    for (const loc of post.dedupedLocations || []) {
      const key = `${loc.name.toLowerCase()}__${(loc.city || '').toLowerCase()}`;
      const current = map.get(key) || {
        name: loc.name,
        city: loc.city || '',
        postCount: 0,
        noteIds: [],
        suggestions: [],
        evidence: []
      };

      current.postCount += 1;
      current.noteIds = uniqueStrings([...current.noteIds, post.noteId]);
      current.suggestions = uniqueStrings([...current.suggestions, ...(loc.suggestions || [])]);
      current.evidence = uniqueStrings([...current.evidence, ...(loc.evidence || [])]);

      map.set(key, current);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.postCount - a.postCount);
}

async function processSingleFolder(pool, folderPath, folderName) {
  const textResultPath = path.join(folderPath, 'text_result.json');
  const imageResultPath = path.join(folderPath, 'image_result.json');

  const textResult = safeReadJson(textResultPath, {});
  const imageResult = safeReadJson(imageResultPath, {});
  const noteId = String(textResult?.noteId || imageResult?.noteId || '').trim();

  if (!noteId) return null;

  const dbPost = await loadPostByNoteId(pool, noteId);
  if (!dbPost) {
    console.warn(`⚠️ 跳过 note_id=${noteId}，数据库中未找到原帖`);
    return null;
  }

  const candidates = collectLocationCandidates(textResult, imageResult);
  const fallbackMood = dbPost.mood || inferMoodFallback(dbPost.title, dbPost.content, textResult?.summary || '');

  let dedupedResult = {
    locations: dedupeCandidatesFallback(candidates),
    primaryLocation: '',
    primaryCity: '',
    mood: fallbackMood,
    reason: 'fallback'
  };

  try {
    const prompt = buildDedupPrompt({
      noteId,
      title: dbPost.title,
      content: dbPost.content,
      city: dbPost.city,
      createdAt: dbPost.created_at
    }, candidates);

    const response = await callStepfunWithRetry({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是结构化旅行数据清洗助手，必须输出严格 JSON。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1
    }, `地点去重 note_id=${noteId}`);

    const parsed = parseAssistantJson(getAssistantText(response)) || {};
    dedupedResult = normalizeLlmResult(parsed, candidates, fallbackMood);
  } catch (error) {
    console.warn(`⚠️ note_id=${noteId} LLM去重失败，使用回退逻辑:`, error.message);
    dedupedResult = normalizeLlmResult({}, candidates, fallbackMood);
  }

  const imageUrls = uniqueStrings([
    ...(Array.isArray(dbPost.image_urls) ? dbPost.image_urls : []),
    dbPost.image_url || ''
  ]);

  const primaryLocation = dedupedResult.primaryLocation || dbPost.location_name || dedupedResult.locations[0]?.name || dbPost.city;
  const primaryCity = dedupedResult.primaryCity || dedupedResult.locations[0]?.city || dbPost.city;

  return {
    noteId,
    sourcePlatform: 'xiaohongshu',
    sourceNoteId: noteId,
    dbPostId: dbPost.id,
    userId: dbPost.user_id,
    title: String(dbPost.title || '').trim(),
    content: String(dbPost.content || '').trim(),
    visitTime: toTimestampLike(dbPost.created_at),
    createdAt: toTimestampLike(dbPost.created_at),
    mood: dedupedResult.mood,
    city: String(dbPost.city || primaryCity || '').trim(),
    district: String(dbPost.district || '').trim(),
    locationName: String(primaryLocation || '').trim(),
    lat: Number(dbPost.lat),
    lng: Number(dbPost.lng),
    imageUrl: imageUrls[0] || null,
    imageUrls,
    category: dbPost.category || null,
    tags: dbPost.tags || null,
    dedupedLocations: dedupedResult.locations,
    llmPrimaryLocation: String(primaryLocation || '').trim(),
    llmPrimaryCity: String(primaryCity || '').trim(),
    llmReason: dedupedResult.reason,
    extraction: {
      folderName,
      textResultPath,
      imageResultPath,
      textSummary: textResult?.summary || '',
      imageSummary: imageResult?.summary || ''
    }
  };
}

async function run() {
  if (!fs.existsSync(GUIDES_DIR)) {
    throw new Error(`目录不存在: ${GUIDES_DIR}`);
  }

  const pool = getPgPool();
  const noteIdFilter = loadNoteIdFilter(NOTE_IDS_FILE);

  try {
    let entries = fs.readdirSync(GUIDES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

    if (noteIdFilter) {
      entries = entries.filter((entry) => {
        const folderPath = path.join(GUIDES_DIR, entry.name);
        const textResult = safeReadJson(path.join(folderPath, 'text_result.json'), {});
        const imageResult = safeReadJson(path.join(folderPath, 'image_result.json'), {});
        const noteId = String(textResult?.noteId || imageResult?.noteId || '').trim();
        return noteIdFilter.has(noteId);
      });
    }

    entries = entries.slice(0, LIMIT);

    const posts = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const folderPath = path.join(GUIDES_DIR, entry.name);
      console.log(`🔍 [${index + 1}/${entries.length}] 处理 ${entry.name}`);

      const item = await processSingleFolder(pool, folderPath, entry.name);
      if (item) posts.push(item);

      await sleep(400);
    }

    const allLocations = buildGlobalLocationIndex(posts);

    const dataset = {
      generatedAt: new Date().toISOString(),
      sourceGuidesDir: GUIDES_DIR,
      totalPosts: posts.length,
      totalLocations: allLocations.length,
      moodOptions: MOOD_OPTIONS,
      posts,
      locations: allLocations
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dataset, null, 2), 'utf8');

    console.log(`✅ 汇总完成: posts=${posts.length}, locations=${allLocations.length}`);
    console.log(`📄 输出文件: ${OUTPUT_FILE}`);
  } finally {
    await closePgPool();
  }
}

run().catch((error) => {
  console.error('❌ 构建 xhs 汇总文件失败:', error.message);
  process.exitCode = 1;
});
