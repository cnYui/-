import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = process.env.XHS_CSV_PATH || path.resolve(__dirname, '../../../../MediaCrawler/data/xhs/jsonl/search_contents_image_author_tags_title_content_time_top50_2026-03-19_clean.csv');
const OUTPUT_ROOT = process.env.XHS_TRAVEL_INTEL_OUTPUT_DIR || path.resolve(__dirname, '../../output/xhs-location-guides');
const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY;
const STEPFUN_BASE_URL = process.env.STEPFUN_BASE_URL || 'https://api.stepfun.com/v1';
const TEXT_MODEL = process.env.STEPFUN_TEXT_MODEL || 'step-3.5-flash';
const VISION_MODEL = process.env.STEPFUN_VISION_MODEL || 'step-1o-turbo-vision';
const LIMIT = Math.max(1, Number(process.env.XHS_TRAVEL_INTEL_LIMIT || 50));
const IMAGE_BATCH_SIZE = Math.max(1, Math.min(8, Number(process.env.XHS_TRAVEL_INTEL_IMAGE_BATCH_SIZE || 4)));
const IMAGE_CONCURRENCY = Math.max(1, Math.min(2, Number(process.env.XHS_TRAVEL_INTEL_IMAGE_CONCURRENCY || 2)));
const API_CONCURRENCY = Math.max(1, Number(process.env.STEPFUN_API_CONCURRENCY || 1));
const EFFECTIVE_IMAGE_CONCURRENCY = Math.min(IMAGE_CONCURRENCY, API_CONCURRENCY);
const REQUEST_TIMEOUT = Math.max(60000, Number(process.env.XHS_TRAVEL_INTEL_TIMEOUT_MS || 180000));
const SKIP_EXISTING = String(process.env.XHS_TRAVEL_INTEL_SKIP_EXISTING || 'true').toLowerCase() !== 'false';

let activeApiRequests = 0;
const apiWaitQueue = [];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
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
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
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
  const headers = rows[0].map((item) => item.trim());

  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = (values[index] || '').trim();
    });
    return item;
  }).filter((item) => item.note_id);
}

function parseImageFiles(row) {
  return String(row.image_files || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => fs.existsSync(item));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sanitizeName(input) {
  const value = String(input || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return value.slice(0, 80) || 'untitled';
}

function ensureUniqueFolderName(baseName, usedNames) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let index = 2;
  while (usedNames.has(`${baseName}_${index}`)) {
    index += 1;
  }
  const finalName = `${baseName}_${index}`;
  usedNames.add(finalName);
  return finalName;
}

function safeReadJsonFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadExistingExtractionIndex(rootDir) {
  const usedNames = new Set();
  const noteIdToFolder = new Map();

  if (!fs.existsSync(rootDir)) {
    return { usedNames, noteIdToFolder };
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const entry of entries) {
    usedNames.add(entry.name);
    const folderPath = path.join(rootDir, entry.name);
    const textResult = safeReadJsonFile(path.join(folderPath, 'text_result.json'), {});
    const imageResult = safeReadJsonFile(path.join(folderPath, 'image_result.json'), {});
    const noteId = String(textResult?.noteId || imageResult?.noteId || '').trim();
    if (noteId) {
      noteIdToFolder.set(noteId, entry.name);
    }
  }

  return { usedNames, noteIdToFolder };
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

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function imageToDataUrl(filePath) {
  const buffer = fs.readFileSync(filePath);
  return `data:${getMimeType(filePath)};base64,${buffer.toString('base64')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseJson(raw) {
  const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
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

async function acquireApiSlot() {
  if (activeApiRequests < API_CONCURRENCY) {
    activeApiRequests += 1;
    return;
  }

  await new Promise((resolve) => {
    apiWaitQueue.push(resolve);
  });

  activeApiRequests += 1;
}

function releaseApiSlot() {
  activeApiRequests = Math.max(0, activeApiRequests - 1);
  const next = apiWaitQueue.shift();
  if (next) next();
}

async function requestStepfun(payload) {
  if (!STEPFUN_API_KEY) {
    throw new Error('缺少 STEPFUN_API_KEY，请先在 backend/.env 中配置');
  }

  await acquireApiSlot();
  try {
    const response = await axios.post(`${STEPFUN_BASE_URL}/chat/completions`, payload, {
      headers: {
        Authorization: `Bearer ${STEPFUN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: REQUEST_TIMEOUT
    });

    return response.data;
  } finally {
    releaseApiSlot();
  }
}

async function requestWithRetry(payload, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await requestStepfun(payload);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const detail = error.response?.data || error.message;
      const message = JSON.stringify(detail);
      console.error(`❌ ${label} 失败，第 ${attempt} 次:`, typeof detail === 'string' ? detail : JSON.stringify(detail));
      if (attempt < 3 && /limited concurrency reached/i.test(message)) {
        await sleep(20000 * attempt);
        continue;
      }
      if (attempt < 3 && (status === 429 || status >= 500 || !status)) {
        await sleep(3000 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function buildBasePrompt(row, sourceType) {
  const sourceHint = sourceType === 'image'
    ? '你当前看到的是图片内容。请重点从图中的文字、招牌、清单、路线图、攻略图、海报里提取地点和建议。'
    : '你当前看到的是帖子文本。请重点从正文、标题、标签里提取地点和建议。';

  return `${sourceHint}\n\n请从这篇小红书帖子中提取“地理位置 + 建议/玩法”。如果帖子里包含多个地点，或者是一整套多地点游玩指南，必须拆成多个独立地点条目。不要编造未出现的信息。\n\n请严格输出 JSON，不要输出 markdown 代码块，结构必须是：\n{\n  "locationGuides": [\n    {\n      "location": "字符串，地点名",\n      "city": "字符串，城市名，没有就空字符串",\n      "suggestions": ["字符串，具体建议/玩法/避坑/顺序"],\n      "evidence": ["字符串，支持该地点与建议的原文片段"],\n      "confidence": 0.0\n    }\n  ],\n  "ocrTexts": ["字符串，仅图片场景尽量填写图中文字；文本场景可为空数组"],\n  "summary": "字符串，整体总结",\n  "uncertain": ["字符串，不确定信息"]\n}\n\n帖子基础信息：\n- note_id: ${row.note_id}\n- title: ${row.title || ''}\n- content: ${row.content || ''}\n- author: ${row.author || ''}\n- tags: ${row.tags || ''}\n- publish_time: ${row.publish_time || ''}`;
}

function normalizeGuideResult(row, mode, parsed) {
  const locationGuides = (Array.isArray(parsed?.locationGuides) ? parsed.locationGuides : [])
    .map((item) => ({
      location: String(item?.location || '').trim(),
      city: String(item?.city || '').trim(),
      suggestions: uniqueStrings(Array.isArray(item?.suggestions) ? item.suggestions : []),
      evidence: uniqueStrings(Array.isArray(item?.evidence) ? item.evidence : []),
      confidence: Number(item?.confidence || 0)
    }))
    .filter((item) => item.location);

  return {
    noteId: row.note_id,
    title: row.title || '',
    mode,
    locationGuides,
    ocrTexts: uniqueStrings(Array.isArray(parsed?.ocrTexts) ? parsed.ocrTexts : []),
    summary: String(parsed?.summary || '').trim(),
    uncertain: uniqueStrings(Array.isArray(parsed?.uncertain) ? parsed.uncertain : [])
  };
}

function mergeLocationGuides(items) {
  const map = new Map();
  for (const item of items || []) {
    for (const guide of item.locationGuides || []) {
      const location = String(guide.location || '').trim();
      const city = String(guide.city || '').trim();
      if (!location) continue;
      const key = `${location.toLowerCase()}__${city.toLowerCase()}`;
      const current = map.get(key) || {
        location,
        city,
        suggestions: [],
        evidence: [],
        confidence: 0
      };
      current.suggestions = uniqueStrings([...(current.suggestions || []), ...(guide.suggestions || [])]);
      current.evidence = uniqueStrings([...(current.evidence || []), ...(guide.evidence || [])]);
      current.confidence = Math.max(Number(current.confidence || 0), Number(guide.confidence || 0));
      map.set(key, current);
    }
  }
  return Array.from(map.values());
}

async function mapWithConcurrency(items, concurrency, worker) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function extractTextResult(row) {
  const response = await requestWithRetry({
    model: TEXT_MODEL,
    messages: [
      {
        role: 'system',
        content: '你是小红书旅行地点与玩法抽取助手。你必须严格输出 JSON。'
      },
      {
        role: 'user',
        content: buildBasePrompt(row, 'text')
      }
    ],
    temperature: 0.2
  }, `文本抽取 note_id=${row.note_id}`);

  const raw = getAssistantText(response);
  return {
    raw,
    result: normalizeGuideResult(row, 'text', safeParseJson(raw) || {})
  };
}

async function extractSingleImageBatch(row, batchImages, batchIndex, totalBatches) {
  const content = batchImages.map((imagePath) => ({
    type: 'image_url',
    image_url: {
      url: imageToDataUrl(imagePath),
      detail: 'high'
    }
  }));

  content.push({
    type: 'text',
    text: `${buildBasePrompt(row, 'image')}\n\n当前是第 ${batchIndex + 1}/${totalBatches} 组图片。请优先识别图中文字中的地点与建议。`
  });

  const response = await requestWithRetry({
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: '你是小红书图片地点与攻略抽取助手。你必须严格输出 JSON。'
      },
      {
        role: 'user',
        content
      }
    ],
    temperature: 0.2
  }, `图片抽取 note_id=${row.note_id} batch=${batchIndex + 1}`);

  const raw = getAssistantText(response);
  return {
    raw,
    result: normalizeGuideResult(row, 'image', safeParseJson(raw) || {})
  };
}

async function extractImageResult(row, imagePaths) {
  if (!imagePaths.length) {
    return {
      raw: '',
      result: {
        noteId: row.note_id,
        title: row.title || '',
        mode: 'image',
        locationGuides: [],
        ocrTexts: [],
        summary: '',
        uncertain: ['该帖子未找到可读取图片']
      }
    };
  }

  const batches = chunkArray(imagePaths, IMAGE_BATCH_SIZE);
  const batchResults = await mapWithConcurrency(batches, EFFECTIVE_IMAGE_CONCURRENCY, async (batch, index) => {
    return extractSingleImageBatch(row, batch, index, batches.length);
  });

  const merged = {
    noteId: row.note_id,
    title: row.title || '',
    mode: 'image',
    locationGuides: mergeLocationGuides(batchResults.map((item) => item.result)),
    ocrTexts: uniqueStrings(batchResults.flatMap((item) => item.result.ocrTexts || [])),
    summary: uniqueStrings(batchResults.map((item) => item.result.summary).filter(Boolean)).join('；'),
    uncertain: uniqueStrings(batchResults.flatMap((item) => item.result.uncertain || []))
  };

  return {
    raw: batchResults.map((item, index) => `# batch_${index + 1}\n${item.raw}`).join('\n\n'),
    result: merged
  };
}

function buildFailureResult(row, mode, error) {
  return {
    noteId: row.note_id,
    title: row.title || '',
    mode,
    locationGuides: [],
    ocrTexts: [],
    summary: '',
    uncertain: [String(error?.message || error || '提取失败')]
  };
}

async function run() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV 文件不存在: ${CSV_PATH}`);
  }

  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csv).slice(0, LIMIT);
  if (!rows.length) {
    throw new Error('CSV 中没有可处理的帖子');
  }

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const { usedNames, noteIdToFolder } = loadExistingExtractionIndex(OUTPUT_ROOT);
  let skippedExisting = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const noteId = String(row.note_id || '').trim();
    const imagePaths = parseImageFiles(row);
    if (SKIP_EXISTING && noteId && noteIdToFolder.has(noteId)) {
      skippedExisting += 1;
      console.log(`⏭️ [${index + 1}/${rows.length}] 跳过已输出 note_id=${noteId} -> ${noteIdToFolder.get(noteId)}`);
      continue;
    }

    const folderName = ensureUniqueFolderName(`帖子_${sanitizeName(row.title || row.note_id)}`, usedNames);
    const folderPath = path.join(OUTPUT_ROOT, folderName);

    console.log(`🔎 [${index + 1}/${rows.length}] 处理帖子: ${row.title || row.note_id}`);

    const [textSettled, imageSettled] = API_CONCURRENCY <= 1
      ? [
          await Promise.resolve(extractTextResult(row)).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason })
          ),
          await sleep(5000).then(() => Promise.resolve(extractImageResult(row, imagePaths))).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason })
          )
        ]
      : await Promise.allSettled([
          extractTextResult(row),
          extractImageResult(row, imagePaths)
        ]);

    const textResult = textSettled.status === 'fulfilled'
      ? textSettled.value.result
      : buildFailureResult(row, 'text', textSettled.reason);

    const imageResult = imageSettled.status === 'fulfilled'
      ? imageSettled.value.result
      : buildFailureResult(row, 'image', imageSettled.reason);

    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, 'text_result.json'), JSON.stringify(textResult, null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'image_result.json'), JSON.stringify(imageResult, null, 2), 'utf8');

    console.log(`✅ 已输出: ${folderPath}`);
    if (noteId) {
      noteIdToFolder.set(noteId, folderName);
    }
    await sleep(300);
  }

  console.log(`📁 输出目录: ${OUTPUT_ROOT}`);
  console.log(`⏭️ 已跳过既有输出: ${skippedExisting}`);
}

run().catch((error) => {
  console.error('❌ 小红书地点与建议提取失败:', error.response?.data || error.message);
  process.exitCode = 1;
});
