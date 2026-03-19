import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = process.env.XHS_CSV_PATH || path.resolve(__dirname, '../../../../MediaCrawler/data/xhs/jsonl/search_contents_image_author_tags_title_content_time_top50_2026-03-19_clean.csv');
const OUTPUT_ROOT = process.env.XHS_TRAVEL_INTEL_OUTPUT_DIR || path.resolve(__dirname, '../../output/xhs-travel-intel');
const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY;
const STEPFUN_BASE_URL = process.env.STEPFUN_BASE_URL || 'https://api.stepfun.com/v1';
const VISION_MODEL = process.env.STEPFUN_VISION_MODEL || 'step-1o-turbo-vision';
const REASONING_MODEL = process.env.STEPFUN_REASONING_MODEL || 'step-3';
const LIMIT = Math.max(1, Number(process.env.XHS_TRAVEL_INTEL_LIMIT || 50));
const IMAGES_PER_BATCH = Math.max(1, Math.min(8, Number(process.env.XHS_TRAVEL_INTEL_BATCH_SIZE || 8)));
const REQUEST_TIMEOUT = Math.max(60000, Number(process.env.XHS_TRAVEL_INTEL_TIMEOUT_MS || 180000));

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
  const headers = rows[0].map((header) => header.trim());

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

function sanitizeName(input) {
  const value = String(input || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return value.slice(0, 80) || 'untitled';
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

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function safeParseJson(raw) {
  const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch (error) {
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch (error) {
    return null;
  }
}

async function requestStepfun(payload) {
  if (!STEPFUN_API_KEY) {
    throw new Error('缺少 STEPFUN_API_KEY，请先在环境变量中配置');
  }

  const response = await axios.post(`${STEPFUN_BASE_URL}/chat/completions`, payload, {
    headers: {
      Authorization: `Bearer ${STEPFUN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: REQUEST_TIMEOUT
  });

  return response.data;
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
      console.error(`❌ ${label} 失败，第 ${attempt} 次:`, typeof detail === 'string' ? detail : JSON.stringify(detail));
      if (attempt < 3 && (status === 429 || status >= 500 || !status)) {
        await sleep(attempt * 2000);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function getAssistantText(data) {
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

async function analyzeImageBatch(row, batchImages, batchIndex, totalBatches) {
  const content = batchImages.map((imagePath) => ({
    type: 'image_url',
    image_url: {
      url: imageToDataUrl(imagePath),
      detail: 'high'
    }
  }));

  content.push({
    type: 'text',
    text: `你正在分析同一篇小红书帖子的第 ${batchIndex + 1}/${totalBatches} 组图片。\n标题：${row.title || ''}\n正文：${row.content || ''}\n作者：${row.author || ''}\n标签：${row.tags || ''}\n发布时间：${row.publish_time || ''}\n\n请基于这组图片输出纯文本分析，按以下分节输出：\n1. 图中地点候选\n2. 图中文字 OCR\n3. 图中旅行活动/行程线索\n4. 图中景色与环境描述\n5. 图中情绪线索\n6. 不确定但可能相关的信息\n\n要求：\n- 尽量列出所有可识别的地点、店名、景点、城市、路牌、招牌\n- 不要编造看不见的信息\n- 如果存在多个地点，要分点列出\n- OCR 文字尽量逐条抄出原文`
  });

  const response = await requestWithRetry({
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: '你是旅行图片理解助手，擅长从图片中识别地点、活动、文字、景色和情绪线索。'
      },
      {
        role: 'user',
        content
      }
    ],
    temperature: 0.2
  }, `视觉分析 note_id=${row.note_id} batch=${batchIndex + 1}`);

  return getAssistantText(response);
}

async function extractStructuredIntel(row, imagePaths, visionTexts) {
  const userPrompt = `请根据以下小红书帖文文本与图片分析结果，提取结构化旅行信息。\n\n帖文基础信息：\n- note_id: ${row.note_id}\n- title: ${row.title || ''}\n- content: ${row.content || ''}\n- author: ${row.author || ''}\n- tags: ${row.tags || ''}\n- publish_time: ${row.publish_time || ''}\n- image_count: ${imagePaths.length}\n\n图片分析结果：\n${visionTexts.map((item, index) => `### 图片批次 ${index + 1}\n${item}`).join('\n\n')}\n\n请你完成以下任务：\n1. 提取帖子涉及的所有旅行地点、景点、店铺、城市、国家，并拆分成多个独立地点\n2. 提取帖子里隐含或明确的旅行计划/行程步骤\n3. 汇总图中所有文字内容\n4. 总结图中景色和环境描述\n5. 结合文本和图片判断发帖人的主要心情\n6. 给出最适合填写到“地理位置”表单中的 locationName 和 city\n\n只输出 JSON，不要输出 markdown 代码块，不要额外解释。JSON 结构必须为：\n{\n  "overallSummary": "字符串",\n  "allSpots": [{"name":"字符串","type":"景点|餐厅|咖啡店|街区|商圈|城市|国家|酒店|交通点|其他","cityHint":"字符串","countryHint":"字符串","evidence":["字符串"],"confidence":0.0}],\n  "locationCandidates": [{"name":"字符串","city":"字符串","reason":"字符串","confidence":0.0,"isPrimary":true}],\n  "travelPlan": [{"step":1,"location":"字符串","activity":"字符串","timeHint":"字符串","evidence":"字符串"}],\n  "ocrTexts": ["字符串"],\n  "sceneryDescriptions": ["字符串"],\n  "mood": {"label":"开心|平静|兴奋|感动|焦虑|治愈|惬意|未知","reason":"字符串","confidence":0.0},\n  "formFillSuggestion": {"mood":"字符串","locationName":"字符串","city":"字符串","district":null},\n  "riskNotes": ["字符串"]\n}`;

  const response = await requestWithRetry({
    model: REASONING_MODEL,
    messages: [
      {
        role: 'system',
        content: '你是旅行信息结构化抽取助手。你必须严格输出 JSON 对象，不输出 markdown 代码块。'
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0.3
  }, `结构化提取 note_id=${row.note_id}`);

  const raw = getAssistantText(response);
  return {
    raw,
    parsed: safeParseJson(raw)
  };
}

function dedupeSpots(spots) {
  const map = new Map();
  for (const item of Array.isArray(spots) ? spots : []) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = map.get(key) || {
      name,
      type: String(item?.type || '其他').trim() || '其他',
      cityHint: String(item?.cityHint || '').trim(),
      countryHint: String(item?.countryHint || '').trim(),
      evidence: [],
      confidence: 0
    };
    existing.evidence = uniqueStrings([...(existing.evidence || []), ...(Array.isArray(item?.evidence) ? item.evidence : [])]);
    existing.confidence = Math.max(Number(existing.confidence || 0), Number(item?.confidence || 0));
    if (!existing.cityHint && item?.cityHint) existing.cityHint = String(item.cityHint).trim();
    if (!existing.countryHint && item?.countryHint) existing.countryHint = String(item.countryHint).trim();
    if (existing.type === '其他' && item?.type) existing.type = String(item.type).trim();
    map.set(key, existing);
  }
  return Array.from(map.values());
}

function normalizeExtraction(row, imagePaths, visionTexts, parsed) {
  const allSpots = dedupeSpots(parsed?.allSpots);
  const locationCandidates = (Array.isArray(parsed?.locationCandidates) ? parsed.locationCandidates : [])
    .map((item) => ({
      name: String(item?.name || '').trim(),
      city: String(item?.city || '').trim(),
      reason: String(item?.reason || '').trim(),
      confidence: Number(item?.confidence || 0),
      isPrimary: Boolean(item?.isPrimary)
    }))
    .filter((item) => item.name);
  const travelPlan = (Array.isArray(parsed?.travelPlan) ? parsed.travelPlan : [])
    .map((item, index) => ({
      step: Number(item?.step || index + 1),
      location: String(item?.location || '').trim(),
      activity: String(item?.activity || '').trim(),
      timeHint: String(item?.timeHint || '').trim(),
      evidence: String(item?.evidence || '').trim()
    }))
    .filter((item) => item.location || item.activity);
  const mood = {
    label: String(parsed?.mood?.label || parsed?.formFillSuggestion?.mood || '未知').trim() || '未知',
    reason: String(parsed?.mood?.reason || '').trim(),
    confidence: Number(parsed?.mood?.confidence || 0)
  };
  const formFillSuggestion = {
    mood: String(parsed?.formFillSuggestion?.mood || mood.label || '').trim(),
    locationName: String(parsed?.formFillSuggestion?.locationName || locationCandidates.find((item) => item.isPrimary)?.name || locationCandidates[0]?.name || allSpots[0]?.name || '').trim(),
    city: String(parsed?.formFillSuggestion?.city || locationCandidates.find((item) => item.isPrimary)?.city || locationCandidates[0]?.city || allSpots[0]?.cityHint || '').trim(),
    district: parsed?.formFillSuggestion?.district ?? null
  };

  return {
    noteId: row.note_id,
    title: row.title || '',
    author: row.author || '',
    publishTime: row.publish_time || '',
    tags: uniqueStrings(String(row.tags || '').split(/[|,]/).map((item) => item.trim())),
    imageCount: imagePaths.length,
    imagePaths,
    overallSummary: String(parsed?.overallSummary || '').trim(),
    allSpots,
    locationCandidates,
    travelPlan,
    ocrTexts: uniqueStrings(Array.isArray(parsed?.ocrTexts) ? parsed.ocrTexts : []),
    sceneryDescriptions: uniqueStrings(Array.isArray(parsed?.sceneryDescriptions) ? parsed.sceneryDescriptions : []),
    mood,
    formFillSuggestion,
    riskNotes: uniqueStrings(Array.isArray(parsed?.riskNotes) ? parsed.riskNotes : []),
    visionBatchCount: visionTexts.length
  };
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

function buildAggregate(results) {
  const allSpots = new Map();
  for (const item of results) {
    for (const spot of item.allSpots || []) {
      const key = String(spot.name || '').trim().toLowerCase();
      if (!key) continue;
      const current = allSpots.get(key) || {
        name: spot.name,
        type: spot.type,
        cityHint: spot.cityHint || '',
        countryHint: spot.countryHint || '',
        confidence: 0,
        noteIds: []
      };
      current.confidence = Math.max(Number(current.confidence || 0), Number(spot.confidence || 0));
      current.noteIds = uniqueStrings([...(current.noteIds || []), item.noteId]);
      if (!current.cityHint && spot.cityHint) current.cityHint = spot.cityHint;
      if (!current.countryHint && spot.countryHint) current.countryHint = spot.countryHint;
      allSpots.set(key, current);
    }
  }

  return {
    totalPosts: results.length,
    totalUniqueSpots: allSpots.size,
    spots: Array.from(allSpots.values()).sort((a, b) => b.noteIds.length - a.noteIds.length || a.name.localeCompare(b.name, 'zh-CN'))
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

  const results = [];
  const usedNames = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const imagePaths = parseImageFiles(row);
    const imageBatches = chunkArray(imagePaths, IMAGES_PER_BATCH);
    const visionTexts = [];

    console.log(`🔎 [${index + 1}/${rows.length}] 分析帖子: ${row.title || row.note_id}`);

    for (let batchIndex = 0; batchIndex < imageBatches.length; batchIndex += 1) {
      const visionText = await analyzeImageBatch(row, imageBatches[batchIndex], batchIndex, imageBatches.length);
      visionTexts.push(visionText);
      await sleep(500);
    }

    const structured = await extractStructuredIntel(row, imagePaths, visionTexts);
    const normalized = normalizeExtraction(row, imagePaths, visionTexts, structured.parsed || {});
    const folderBase = sanitizeName(row.title || row.note_id);
    const folderName = ensureUniqueFolderName(folderBase, usedNames);
    const folderPath = path.join(OUTPUT_ROOT, folderName);

    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, 'source.json'), JSON.stringify({ ...row, imagePaths }, null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'vision_analysis.txt'), visionTexts.join('\n\n===== 图片批次分隔 =====\n\n'), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'structured_raw.txt'), structured.raw || '', 'utf8');
    fs.writeFileSync(path.join(folderPath, 'travel_intel.json'), JSON.stringify(normalized, null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'spots.json'), JSON.stringify(normalized.allSpots || [], null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'location_candidates.json'), JSON.stringify(normalized.locationCandidates || [], null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'travel_plan.json'), JSON.stringify(normalized.travelPlan || [], null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'form_fill_suggestion.json'), JSON.stringify(normalized.formFillSuggestion || {}, null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'ocr_texts.txt'), (normalized.ocrTexts || []).join('\n'), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'scenery_descriptions.txt'), (normalized.sceneryDescriptions || []).join('\n'), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'risk_notes.txt'), (normalized.riskNotes || []).join('\n'), 'utf8');

    results.push(normalized);
    console.log(`✅ 已输出: ${folderPath}`);
    await sleep(500);
  }

  const aggregate = buildAggregate(results);
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'posts_index.json'), JSON.stringify(results.map((item) => ({
    noteId: item.noteId,
    title: item.title,
    mood: item.mood?.label || '',
    locationName: item.formFillSuggestion?.locationName || '',
    city: item.formFillSuggestion?.city || '',
    spotCount: item.allSpots?.length || 0
  })), null, 2), 'utf8');
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'all_spots.json'), JSON.stringify(aggregate, null, 2), 'utf8');

  console.log(`📁 输出目录: ${OUTPUT_ROOT}`);
  console.log(`🗺️ 汇总景点数: ${aggregate.totalUniqueSpots}`);
}

run().catch((error) => {
  console.error('❌ 小红书旅行信息提取失败:', error.response?.data || error.message);
  process.exitCode = 1;
});
