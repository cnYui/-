import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = process.env.XHS_SLIM_CSV_PATH
  || path.resolve(__dirname, '../../../../MediaCrawler/data/xhs/jsonl/search_contents_multicity_balanced_200_2026-03-19_slim.csv');
const XHS_IMAGES_ROOT = process.env.XHS_IMAGES_ROOT
  || path.resolve(__dirname, '../../../../MediaCrawler/data/xhs/images');
const GUIDES_DIR = process.env.XHS_TRAVEL_INTEL_OUTPUT_DIR
  || path.resolve(__dirname, '../../output/xhs-location-guides');
const REPORT_DIR = process.env.XHS_SLIM_PIPELINE_OUTPUT_DIR
  || path.resolve(__dirname, '../../output/xhs-slim-pipeline');
const DATASET_PATH = process.env.XHS_GUIDES_DATASET_OUTPUT
  || path.join(GUIDES_DIR, 'xhs_posts_dataset.json');
const RESET_BEFORE_IMPORT = String(process.env.XHS_RESET_BEFORE_IMPORT || 'false').toLowerCase() === 'true';
const RESET_GUIDES_OUTPUT = String(process.env.XHS_RESET_GUIDES_OUTPUT || 'false').toLowerCase() === 'true';
const RESUME_FROM_EXISTING_GUIDES = String(process.env.XHS_RESUME_FROM_EXISTING_GUIDES || 'false').toLowerCase() === 'true';
const PIPELINE_LIMIT = Math.max(1, Number(process.env.XHS_PIPELINE_LIMIT || 500));

function ensureAnyEnv(names) {
  const hasValue = names.some((name) => String(process.env[name] || '').trim());
  if (!hasValue) {
    throw new Error(`缺少环境变量: ${names.join(' / ')}`);
  }
}

function runNodeScript(scriptName, extraEnv = {}) {
  const scriptPath = path.resolve(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`执行失败: ${scriptName}`);
  }
}

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
  }).filter((item) => item.title || item.content || item.image_folder);
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function deriveNoteId(row) {
  const folder = String(row.image_folder || '').trim();
  const fromFolder = folder ? path.basename(folder.replace(/\\+$/, '')) : '';
  if (fromFolder) return fromFolder;

  return `slim_${crypto
    .createHash('sha1')
    .update(`${row.title || ''}|${row.author || ''}|${row.publish_time || ''}|${row.content || ''}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function resolveImageFolder(row, noteId) {
  const rawFolder = String(row.image_folder || '').trim();
  if (rawFolder && fs.existsSync(rawFolder) && fs.statSync(rawFolder).isDirectory()) {
    return rawFolder;
  }

  const fallback = path.join(XHS_IMAGES_ROOT, noteId);
  if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) {
    return fallback;
  }

  return null;
}

function parseImageFiles(folderPath) {
  if (!folderPath) return [];
  return fs.readdirSync(folderPath)
    .filter((name) => /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => path.join(folderPath, name));
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function prepareRows(rows) {
  return rows.slice(0, PIPELINE_LIMIT).map((row) => {
    const noteId = deriveNoteId(row);
    const imageFolder = resolveImageFolder(row, noteId);
    const imageFiles = parseImageFiles(imageFolder);

    return {
      noteId,
      title: normalizeText(row.title),
      content: normalizeText(row.content),
      author: normalizeText(row.author),
      tags: normalizeText(row.tags),
      publish_time: normalizeText(row.publish_time),
      image_folder: imageFolder,
      image_files: imageFiles,
      raw: row
    };
  });
}

function writeNormalizedExtractionCsv(rows, outputPath) {
  const headers = ['note_id', 'title', 'content', 'author', 'tags', 'publish_time', 'image_files'];
  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = [
      row.noteId,
      row.title,
      row.content,
      row.author,
      row.tags,
      row.publish_time,
      row.image_files.join('|')
    ];
    lines.push(values.map(csvEscape).join(','));
  }

  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function writeNoteManifest(rows, outputPath) {
  const payload = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    noteIds: rows.map((row) => row.noteId)
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
}

function safeReadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function collectExtractedGuideNoteIds(guidesDir) {
  if (!fs.existsSync(guidesDir)) return [];

  const noteIds = [];
  const seen = new Set();
  const entries = fs.readdirSync(guidesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const entry of entries) {
    const folderPath = path.join(guidesDir, entry.name);
    const textResult = safeReadJson(path.join(folderPath, 'text_result.json'), {});
    const imageResult = safeReadJson(path.join(folderPath, 'image_result.json'), {});
    const noteId = String(textResult?.noteId || imageResult?.noteId || '').trim();
    if (!noteId || seen.has(noteId)) continue;
    seen.add(noteId);
    noteIds.push(noteId);
  }

  return noteIds;
}

function resetGuidesDirIfNeeded() {
  if (!RESET_GUIDES_OUTPUT) {
    fs.mkdirSync(GUIDES_DIR, { recursive: true });
    return;
  }

  fs.rmSync(GUIDES_DIR, { recursive: true, force: true });
  fs.mkdirSync(GUIDES_DIR, { recursive: true });
}

async function collectSummary(noteIds) {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    if (!noteIds.length) {
      return {
        totalPosts: 0,
        byCity: [],
        byGeoConfidence: [],
        sample: []
      };
    }

    const totalResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM posts
       WHERE source_platform = 'xiaohongshu'
         AND source_note_id = ANY($1)`,
      [noteIds]
    );

    const cityResult = await client.query(
      `SELECT city, COUNT(*)::int AS count
       FROM posts
       WHERE source_platform = 'xiaohongshu'
         AND source_note_id = ANY($1)
       GROUP BY city
       ORDER BY count DESC, city ASC`,
      [noteIds]
    );

    const geoResult = await client.query(
      `SELECT COALESCE(geo_confidence, 'null') AS geo_confidence, COUNT(*)::int AS count
       FROM posts
       WHERE source_platform = 'xiaohongshu'
         AND source_note_id = ANY($1)
       GROUP BY COALESCE(geo_confidence, 'null')
       ORDER BY count DESC, geo_confidence ASC`,
      [noteIds]
    );

    const sampleResult = await client.query(
      `SELECT source_note_id, city, location_name, lat, lng, geo_confidence, created_at
       FROM posts
       WHERE source_platform = 'xiaohongshu'
         AND source_note_id = ANY($1)
       ORDER BY created_at DESC
       LIMIT 12`,
      [noteIds]
    );

    return {
      totalPosts: totalResult.rows[0]?.total || 0,
      byCity: cityResult.rows,
      byGeoConfidence: geoResult.rows,
      sample: sampleResult.rows
    };
  } finally {
    client.release();
    await closePgPool();
  }
}

async function run() {
  if (!RESUME_FROM_EXISTING_GUIDES && !fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV 文件不存在: ${CSV_PATH}`);
  }

  ensureAnyEnv(['STEPFUN_API_KEY']);
  ensureAnyEnv(['AMAP_WEB_SERVICE_KEYS', 'AMAP_WEB_SERVICE_KEY']);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  resetGuidesDirIfNeeded();

  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const normalizedCsvPath = path.join(REPORT_DIR, `slim-normalized-${stamp}.csv`);
  const noteIdsFile = path.join(REPORT_DIR, `slim-note-ids-${stamp}.json`);
  const reportPath = path.join(REPORT_DIR, `pipeline-report-${stamp}.json`);

  let extractedNoteIds = [];

  if (RESUME_FROM_EXISTING_GUIDES) {
    extractedNoteIds = collectExtractedGuideNoteIds(GUIDES_DIR);
    if (!extractedNoteIds.length) {
      throw new Error(`未在 ${GUIDES_DIR} 中找到可续跑的已抽取帖子`);
    }
    writeNoteManifest(extractedNoteIds.map((noteId) => ({ noteId })), noteIdsFile);
  } else {
    const csvText = fs.readFileSync(CSV_PATH, 'utf8');
    const rawRows = parseCsv(csvText);
    if (!rawRows.length) {
      throw new Error('CSV 无有效数据');
    }

    rows = prepareRows(rawRows);
    if (!rows.length) {
      throw new Error('没有可处理的帖子');
    }

    extractedNoteIds = rows.map((row) => row.noteId);
    writeNormalizedExtractionCsv(rows, normalizedCsvPath);
    writeNoteManifest(rows, noteIdsFile);

    resetGuidesDirIfNeeded();

    runNodeScript('import-xhs-slim-csv.js', {
      XHS_SLIM_CSV_PATH: CSV_PATH,
      XHS_RESET_BEFORE_IMPORT: String(RESET_BEFORE_IMPORT)
    });

    runNodeScript('extract-xhs-location-guides.js', {
      XHS_CSV_PATH: normalizedCsvPath,
      XHS_TRAVEL_INTEL_OUTPUT_DIR: GUIDES_DIR,
      XHS_TRAVEL_INTEL_LIMIT: String(rows.length),
      XHS_TRAVEL_INTEL_SKIP_EXISTING: 'true'
    });
  }

  runNodeScript('build-xhs-guides-dataset.js', {
    XHS_TRAVEL_INTEL_OUTPUT_DIR: GUIDES_DIR,
    XHS_GUIDES_DATASET_OUTPUT: DATASET_PATH,
    XHS_GUIDES_BUILD_LIMIT: String(extractedNoteIds.length),
    XHS_GUIDES_NOTE_IDS_FILE: noteIdsFile
  });

  runNodeScript('refine-xhs-dataset-locations-stepfun.js', {
    XHS_GUIDES_DATASET_OUTPUT: DATASET_PATH,
    XHS_LOCATION_REFINE_LIMIT: String(extractedNoteIds.length)
  });

  runNodeScript('import-xhs-guides-dataset.js', {
    XHS_GUIDES_DATASET_OUTPUT: DATASET_PATH,
    XHS_TRAVEL_INTEL_OUTPUT_DIR: GUIDES_DIR
  });

  runNodeScript('geocode-xhs-posts-amap.js', {
    XHS_NOTE_IDS_FILE: noteIdsFile,
    XHS_AMAP_GEOCODE_LIMIT: String(extractedNoteIds.length)
  });

  const summary = await collectSummary(extractedNoteIds);
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    csvPath: RESUME_FROM_EXISTING_GUIDES ? null : CSV_PATH,
    normalizedCsvPath,
    noteIdsFile,
    guidesDir: GUIDES_DIR,
    datasetPath: DATASET_PATH,
    totalRows: extractedNoteIds.length,
    resumeFromExistingGuides: RESUME_FROM_EXISTING_GUIDES,
    steps: [
      'import-xhs-slim-csv.js',
      'extract-xhs-location-guides.js',
      'build-xhs-guides-dataset.js',
      'refine-xhs-dataset-locations-stepfun.js',
      'import-xhs-guides-dataset.js',
      'geocode-xhs-posts-amap.js'
    ],
    prompts: {
      guideExtraction: 'extract-xhs-location-guides.js -> buildBasePrompt',
      guideDedupAndPrimaryLocation: 'build-xhs-guides-dataset.js -> buildDedupPrompt',
      locationRefine: 'refine-xhs-dataset-locations-stepfun.js -> buildPrompt'
    },
    summary
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('✅ XHS 一体化流水线执行完成');
  console.log(`📄 报告输出: ${reportPath}`);
}

run().catch((error) => {
  console.error('❌ XHS 一体化流水线执行失败:', error.message);
  process.exitCode = 1;
});
