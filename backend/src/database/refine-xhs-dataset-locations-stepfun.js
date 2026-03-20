import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATASET_FILE = process.env.XHS_GUIDES_DATASET_OUTPUT || path.resolve(__dirname, '../../output/xhs-location-guides/xhs_posts_dataset.json');
const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY;
const STEPFUN_BASE_URL = process.env.STEPFUN_BASE_URL || 'https://api.stepfun.com/v1';
const LLM_MODEL = process.env.STEPFUN_TEXT_MODEL || 'step-3.5-flash';
const REQUEST_TIMEOUT_MS = Math.max(60000, Number(process.env.XHS_GUIDES_LLM_TIMEOUT_MS || 180000));
const REQUEST_RETRY = Math.max(1, Number(process.env.XHS_GUIDES_LLM_RETRY || 4));
const REFINE_LIMIT = Math.max(1, Number(process.env.XHS_LOCATION_REFINE_LIMIT || 500));
const REQUEST_INTERVAL_MS = Math.max(200, Number(process.env.XHS_LOCATION_REFINE_INTERVAL_MS || 800));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function normalizeTextToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[·•，,。.!！?？、\-—_（）()\[\]【】]/g, '');
}

function isLikelyEmojiOnly(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  const stripped = text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
  return !stripped;
}

function isGenericLocationName(value, city) {
  const text = String(value || '').trim();
  const normalized = normalizeTextToken(text);
  const normalizedCity = normalizeTextToken(city);
  if (!normalized) return true;
  if (isLikelyEmojiOnly(text)) return true;
  if (normalized.length <= 2) return true;
  if (normalizedCity && normalized === normalizedCity) return true;

  return [
    '旅游攻略', 'citywalk', 'city', 'vlog', '拍照', '打卡', '一日游', '两日游', '三日游',
    '地铁', '海边', '公园', '景区', '商场', '古镇', '路线', '攻略', '合集', '周末', '假期'
  ].some((keyword) => normalized.includes(normalizeTextToken(keyword)));
}

function pickFallbackAnchor(post) {
  const candidates = Array.isArray(post?.dedupedLocations) ? post.dedupedLocations : [];
  const city = String(post?.city || '').trim();
  const normalizedCity = normalizeTextToken(city);

  const validCandidates = candidates
    .map((item) => ({
      name: String(item?.name || '').trim(),
      city: String(item?.city || '').trim(),
      suggestions: Array.isArray(item?.suggestions) ? item.suggestions : [],
      evidence: Array.isArray(item?.evidence) ? item.evidence : []
    }))
    .filter((item) => item.name && !isGenericLocationName(item.name, city));

  const sameCityCandidate = validCandidates.find((item) => {
    const candidateCity = normalizeTextToken(item.city);
    return !candidateCity || !normalizedCity || candidateCity === normalizedCity;
  });

  return sameCityCandidate || validCandidates[0] || null;
}

function buildPrompt(post) {
  const content = String(post?.content || '').slice(0, 1800);
  const candidates = Array.isArray(post?.dedupedLocations)
    ? post.dedupedLocations
        .map((item, index) => `${index + 1}. ${String(item?.name || '').trim()}（城市=${String(item?.city || '').trim() || '未知'}）`)
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return `你是“地点清洗与地理编码预处理”助手。请根据单帖信息，输出一个可用于高德地理编码的精准地点。\n\n请严格输出 JSON，不要输出 markdown。结构必须是：\n{\n  "resolvedLocationName": "精准地点名",\n  "resolvedCity": "城市名",\n  "confidence": 0.0,\n  "reason": "一句话解释"\n}\n\n硬性规则：\n1) 必须结合 locationName、city、title、content、dedupedLocations 共同判断。\n2) resolvedLocationName 必须是“可直接 geocode 的地点锚点”，优先：古镇/景区/公园/商圈/街区/湖/寺/桥/市场/地铁站。\n3) 禁止输出泛词：城市名（如“无锡/杭州/上海”）、情绪词、攻略标题、时间词、句子。\n4) 禁止优先单店；仅当整帖明显围绕一家店/一个场馆时，才输出单店名。\n5) 如果是多地点攻略/合集/路线，优先输出最能代表整帖的区域级锚点地点。\n6) 若候选里同时有区域级地点和单店，优先区域级地点。\n7) resolvedCity 必须与地点一致，严禁跨城（例如“鼋头渚”必须是无锡）。\n8) 若无法确定精准地点，保留原 locationName，但不能退化成仅城市名。\n\n输出示例（仅风格参考）：\n- 正确："鼋头渚"、"惠山古镇"、"清名桥历史文化街区"、"西湖"\n- 错误："无锡"、"杭州"、"无锡旅游攻略"、"极限十小时在无锡我都吃了啥"\n\n输入：\n- noteId: ${post?.noteId || ''}\n- sourceNoteId: ${post?.sourceNoteId || ''}\n- city: ${post?.city || ''}\n- locationName: ${post?.locationName || ''}\n- title: ${post?.title || ''}\n- content: ${content}\n- dedupedLocations:\n${candidates.length ? candidates.join('\n') : '无'}`;
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

function normalizeRefinedLocation(post, parsed) {
  const oldLocation = String(post?.locationName || '').trim();
  const oldCity = String(post?.city || '').trim();

  const resolvedLocationName = String(parsed?.resolvedLocationName || '').trim();
  const resolvedCity = String(parsed?.resolvedCity || '').trim();
  const confidence = Number(parsed?.confidence || 0);
  const reason = String(parsed?.reason || '').trim();

  let finalLocation = resolvedLocationName || oldLocation || oldCity;
  let finalCity = resolvedCity || oldCity;

  if (isGenericLocationName(finalLocation, finalCity || oldCity)) {
    const fallbackAnchor = pickFallbackAnchor(post);
    if (fallbackAnchor) {
      finalLocation = fallbackAnchor.name;
      finalCity = fallbackAnchor.city || finalCity || oldCity;
    }
  }

  if (isGenericLocationName(finalLocation, finalCity || oldCity)) {
    const fallbackAnchor = pickFallbackAnchor({
      ...post,
      dedupedLocations: rebuildLocationIndex([post]).map((item) => ({ name: item.name, city: item.city }))
    });
    if (fallbackAnchor) {
      finalLocation = fallbackAnchor.name;
      finalCity = fallbackAnchor.city || finalCity || oldCity;
    }
  }

  return {
    finalLocation,
    finalCity,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    reason,
    changed: finalLocation !== oldLocation || finalCity !== oldCity
  };
}

function rebuildLocationIndex(posts) {
  const map = new Map();

  for (const post of posts || []) {
    const name = String(post?.locationName || '').trim();
    const city = String(post?.city || '').trim();
    if (!name) continue;

    const key = `${name.toLowerCase()}__${city.toLowerCase()}`;
    const current = map.get(key) || {
      name,
      city,
      postCount: 0,
      noteIds: []
    };

    current.postCount += 1;
    current.noteIds = uniqueStrings([...current.noteIds, String(post?.noteId || post?.sourceNoteId || '')]);

    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) => b.postCount - a.postCount);
}

async function refineOnePost(post, index, total) {
  const label = `location_refine noteId=${post?.noteId || post?.sourceNoteId || index}`;
  console.log(`🔍 [${index + 1}/${total}] ${label}`);

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
  return normalizeRefinedLocation(post, parsed);
}

async function run() {
  const dataset = safeReadJson(DATASET_FILE);
  const posts = Array.isArray(dataset?.posts) ? dataset.posts : [];

  if (!posts.length) {
    throw new Error('dataset.posts 为空，无法处理');
  }

  const targetPosts = posts.slice(0, Math.min(REFINE_LIMIT, posts.length));
  let changedCount = 0;

  for (let i = 0; i < targetPosts.length; i += 1) {
    const post = targetPosts[i];

    try {
      const refined = await refineOnePost(post, i, targetPosts.length);

      if (refined.changed) {
        changedCount += 1;
      }

      post.locationNameOriginal = post.locationName || null;
      post.cityOriginal = post.city || null;
      post.locationName = refined.finalLocation;
      post.city = refined.finalCity;
      post.locationRefinement = {
        provider: 'stepfun',
        model: LLM_MODEL,
        confidence: refined.confidence,
        reason: refined.reason,
        refinedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn(`⚠️ 跳过 noteId=${post?.noteId || post?.sourceNoteId || i}: ${error.message}`);
      post.locationRefinement = {
        provider: 'stepfun',
        model: LLM_MODEL,
        confidence: 0,
        reason: `failed: ${error.message}`,
        refinedAt: new Date().toISOString()
      };
    }

    await sleep(REQUEST_INTERVAL_MS);
  }

  dataset.generatedAt = new Date().toISOString();
  dataset.locationRefinedAt = dataset.generatedAt;
  dataset.locationRefineModel = LLM_MODEL;
  dataset.totalPosts = posts.length;
  dataset.locations = rebuildLocationIndex(posts);
  dataset.totalLocations = dataset.locations.length;

  fs.writeFileSync(DATASET_FILE, JSON.stringify(dataset, null, 2), 'utf8');

  console.log(`✅ 地点精抽取完成：处理 ${targetPosts.length} 条，发生变更 ${changedCount} 条`);
  console.log(`📄 输出文件：${DATASET_FILE}`);
}

run().catch((error) => {
  console.error('❌ 地点精抽取失败:', error.message);
  process.exitCode = 1;
});
