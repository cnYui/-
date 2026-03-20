import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = process.env.XHS_SLIM_CSV_PATH
  || path.resolve(__dirname, '../../../../MediaCrawler/data/xhs/jsonl/search_contents_multicity_balanced_200_2026-03-19_slim.csv');
const OUTPUT_DIR = process.env.XHS_SLIM_PIPELINE_OUTPUT_DIR
  || path.resolve(__dirname, '../../output/xhs-slim-pipeline');
const REFINE_LIMIT = String(process.env.XHS_DB_LOCATION_REFINE_LIMIT || '500');
const GEOCODE_LIMIT = String(process.env.XHS_AMAP_GEOCODE_LIMIT || '500');
const RESET_BEFORE_IMPORT = String(process.env.XHS_RESET_BEFORE_IMPORT || 'false');

function ensureEnv(name, allowFallback = false) {
  const value = String(process.env[name] || '').trim();
  if (!value && !allowFallback) {
    throw new Error(`缺少环境变量 ${name}`);
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

async function collectSummary() {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const totalResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM posts
       WHERE source_platform = 'xiaohongshu'`
    );

    const cityResult = await client.query(
      `SELECT city, COUNT(*)::int AS count
       FROM posts
       WHERE source_platform = 'xiaohongshu'
       GROUP BY city
       ORDER BY count DESC, city ASC`
    );

    const geoResult = await client.query(
      `SELECT COALESCE(geo_confidence, 'null') AS geo_confidence, COUNT(*)::int AS count
       FROM posts
       WHERE source_platform = 'xiaohongshu'
       GROUP BY COALESCE(geo_confidence, 'null')
       ORDER BY count DESC, geo_confidence ASC`
    );

    const sampleResult = await client.query(
      `SELECT source_note_id, city, location_name, lat, lng, geo_confidence, created_at
       FROM posts
       WHERE source_platform = 'xiaohongshu'
       ORDER BY created_at DESC
       LIMIT 12`
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
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV 文件不存在: ${CSV_PATH}`);
  }

  ensureEnv('STEPFUN_API_KEY');
  ensureEnv('AMAP_WEB_SERVICE_KEYS', true);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const startedAt = new Date().toISOString();
  const startedAtSafe = startedAt.replace(/[:.]/g, '-');
  const reportPath = path.join(OUTPUT_DIR, `pipeline-report-${startedAtSafe}.json`);

  runNodeScript('import-xhs-slim-csv.js', {
    XHS_SLIM_CSV_PATH: CSV_PATH,
    XHS_RESET_BEFORE_IMPORT: RESET_BEFORE_IMPORT
  });

  runNodeScript('refine-xhs-posts-locations-stepfun.js', {
    XHS_DB_LOCATION_REFINE_LIMIT: REFINE_LIMIT
  });

  runNodeScript('geocode-xhs-posts-amap.js', {
    XHS_AMAP_GEOCODE_LIMIT: GEOCODE_LIMIT
  });

  const summary = await collectSummary();
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    csvPath: CSV_PATH,
    steps: [
      {
        name: 'import_xhs_slim_csv',
        script: 'src/database/import-xhs-slim-csv.js'
      },
      {
        name: 'stepfun_refine_post_locations',
        script: 'src/database/refine-xhs-posts-locations-stepfun.js',
        promptFunction: 'buildPrompt'
      },
      {
        name: 'amap_geocode_posts',
        script: 'src/database/geocode-xhs-posts-amap.js',
        addressBuilder: 'buildAddressCandidates'
      }
    ],
    prompts: {
      guideExtraction: 'src/database/extract-xhs-location-guides.js -> buildBasePrompt',
      guideDedupAndPrimaryLocation: 'src/database/build-xhs-guides-dataset.js -> buildDedupPrompt',
      dbLocationRefine: 'src/database/refine-xhs-posts-locations-stepfun.js -> buildPrompt',
      datasetLocationRefine: 'src/database/refine-xhs-dataset-locations-stepfun.js -> buildPrompt'
    },
    outputDir: OUTPUT_DIR,
    summary
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✅ XHS 完整流水线执行完成`);
  console.log(`📄 报告输出: ${reportPath}`);
}

run().catch((error) => {
  console.error('❌ XHS 完整流水线执行失败:', error.message);
  process.exitCode = 1;
});
