import fs from 'fs';
import dotenv from 'dotenv';
import axios from 'axios';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const AMAP_WEB_SERVICE_KEYS = (process.env.AMAP_WEB_SERVICE_KEYS
  || process.env.AMAP_WEB_SERVICE_KEY
  || '0b810e8b0cfda56e294d0e78787a2573,abd7f53f3ce7743e2d03027257136143')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const AMAP_GEOCODE_URL = process.env.AMAP_GEOCODE_URL || 'https://restapi.amap.com/v3/geocode/geo';
const AMAP_PLACE_TEXT_URL = process.env.AMAP_PLACE_TEXT_URL || 'https://restapi.amap.com/v3/place/text';
const NOTE_IDS_FILE = process.env.XHS_NOTE_IDS_FILE || '';
const LIMIT = Math.max(1, Number(process.env.XHS_AMAP_GEOCODE_LIMIT || 200));
const REQUEST_INTERVAL_MS = Math.max(100, Number(process.env.XHS_AMAP_GEOCODE_INTERVAL_MS || 220));
const REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.XHS_AMAP_GEOCODE_TIMEOUT_MS || 10000));
const RETRY_MAX = Math.max(1, Number(process.env.XHS_AMAP_GEOCODE_RETRY_MAX || 3));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanPlaceText(value) {
  return String(value || '')
    .replace(/[【】\[\]（）()]/g, ' ')
    .replace(/[·•➕+]/g, ' ')
    .replace(/[#＃].*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCityFromText(...texts) {
  const source = texts.map((x) => String(x || '')).join(' ');
  if (/武汉/.test(source)) return '武汉';
  if (/上海/.test(source)) return '上海';
  if (/北京/.test(source)) return '北京';
  if (/杭州/.test(source)) return '杭州';
  if (/南京/.test(source)) return '南京';
  if (/苏州/.test(source)) return '苏州';
  if (/珠海/.test(source)) return '珠海';
  return '';
}

function normalizeAmapCityText(value) {
  return String(value || '')
    .replace(/市|地区|自治州|盟/g, '')
    .trim();
}

function extractAmapCityTokens(hit = {}) {
  return [
    hit.city,
    hit.cityName,
    hit.province,
    hit.provinceName,
    hit.district,
    hit.adName,
    hit.formattedAddress
  ]
    .map(normalizeAmapCityText)
    .filter(Boolean);
}

function isHitConsistentWithCity(hit, cityHint) {
  const target = normalizeAmapCityText(cityHint);
  if (!target) return true;
  const tokens = extractAmapCityTokens(hit);
  return tokens.some((token) => token.includes(target) || target.includes(token));
}

function parseLocation(locationText) {
  const [lngRaw, latRaw] = String(locationText || '').split(',');
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function loadNoteIds(filePath) {
  const target = String(filePath || '').trim();
  if (!target || !fs.existsSync(target)) return [];

  const payload = JSON.parse(fs.readFileSync(target, 'utf8'));
  const noteIds = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.noteIds)
      ? payload.noteIds
      : [];

  return noteIds
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function buildAddressCandidates(row) {
  const locationName = cleanPlaceText(row.location_name || '');
  const title = cleanPlaceText(row.title || '');
  const content = cleanPlaceText(row.content || '');
  const cityRaw = cleanPlaceText(row.city || '');
  const inferredCity = inferCityFromText(locationName, title, content);
  const cityHint = inferredCity || cityRaw;

  const candidates = [];
  if (locationName) {
    candidates.push(locationName);
    if (cityHint && !locationName.includes(cityHint)) {
      candidates.push(`${cityHint}${locationName}`);
    }
  }

  if (title) {
    const shortTitle = title.slice(0, 40);
    candidates.push(shortTitle);
  }

  if (cityHint) {
    candidates.push(cityHint);
  }

  const dedup = [];
  const seen = new Set();
  for (const item of candidates) {
    const v = String(item || '').trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(v);
  }

  return { addressCandidates: dedup, cityHint };
}

async function geocodeByAmap(key, address, cityHint) {
  const response = await axios.get(AMAP_GEOCODE_URL, {
    params: {
      key,
      address,
      city: cityHint || undefined
    },
    timeout: REQUEST_TIMEOUT_MS
  });

  const data = response.data || {};
  if (String(data.status) !== '1') {
    throw new Error(`高德返回失败: ${data.info || 'unknown'}`);
  }

  const geocodes = Array.isArray(data.geocodes) ? data.geocodes : [];
  if (!geocodes.length) return null;

  const first = geocodes[0];
  const location = parseLocation(first.location);
  if (!location) return null;

  return {
    ...location,
    formattedAddress: first.formatted_address || null,
    province: first.province || null,
    city: Array.isArray(first.city) ? first.city[0] || null : first.city || null,
    district: first.district || null,
    level: first.level || null,
    source: 'geocode'
  };
}

async function searchPlaceByAmap(key, keywords, cityHint) {
  const response = await axios.get(AMAP_PLACE_TEXT_URL, {
    params: {
      key,
      keywords,
      city: cityHint || undefined,
      offset: 1,
      page: 1,
      extensions: 'base'
    },
    timeout: REQUEST_TIMEOUT_MS
  });

  const data = response.data || {};
  if (String(data.status) !== '1') {
    throw new Error(`高德POI失败: ${data.info || 'unknown'}`);
  }

  const pois = Array.isArray(data.pois) ? data.pois : [];
  if (!pois.length) return null;

  const first = pois[0];
  const location = parseLocation(first.location);
  if (!location) return null;

  return {
    ...location,
    formattedAddress: first.address || null,
    provinceName: first.pname || null,
    cityName: first.cityname || null,
    adName: first.adname || null,
    level: 'poi',
    source: 'place_text'
  };
}

async function geocodeWithFallback(addressCandidates, cityHint) {
  let lastError = null;

  for (let attempt = 1; attempt <= RETRY_MAX; attempt += 1) {
    for (const key of AMAP_WEB_SERVICE_KEYS) {
      for (const address of addressCandidates) {
        const cityOptions = cityHint ? [cityHint, ''] : [''];

        for (const cityOption of cityOptions) {
          try {
            const geo = await geocodeByAmap(key, address, cityOption);
            if (geo && isHitConsistentWithCity(geo, cityHint || cityOption)) return geo;
          } catch (error) {
            lastError = error;
            const msg = String(error.message || '');
            if (/CUQPS_HAS_EXCEEDED_THE_LIMIT|USER_DAILY_QUERY_OVER_LIMIT/i.test(msg)) {
              await sleep(1500);
            }
          }

          try {
            const poi = await searchPlaceByAmap(key, address, cityOption);
            if (poi && isHitConsistentWithCity(poi, cityHint || cityOption)) return poi;
          } catch (error) {
            lastError = error;
            const msg = String(error.message || '');
            if (/CUQPS_HAS_EXCEEDED_THE_LIMIT|USER_DAILY_QUERY_OVER_LIMIT/i.test(msg)) {
              await sleep(1500);
            }
          }
        }
      }
    }

    await sleep(1000 * attempt);
  }

  if (lastError) throw lastError;
  return null;
}

async function run() {
  if (!AMAP_WEB_SERVICE_KEYS.length) {
    throw new Error('缺少 AMAP_WEB_SERVICE_KEYS');
  }

  const pool = getPgPool();
  const client = await pool.connect();
  const noteIds = loadNoteIds(NOTE_IDS_FILE);

  try {
    const before = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT (lat::text || ',' || lng::text))::int AS unique_points
       FROM posts
       WHERE source_platform = 'xiaohongshu'`
    );

    const rows = noteIds.length
      ? await client.query(
          `SELECT id, source_note_id, title, content, city, district, location_name, lat, lng, geo_confidence
           FROM posts
           WHERE source_platform = 'xiaohongshu'
             AND location_name IS NOT NULL
             AND location_name <> ''
             AND source_note_id = ANY($2)
           ORDER BY created_at DESC
           LIMIT $1`,
          [LIMIT, noteIds]
        )
      : await client.query(
          `SELECT id, source_note_id, title, content, city, district, location_name, lat, lng, geo_confidence
           FROM posts
           WHERE source_platform = 'xiaohongshu'
             AND location_name IS NOT NULL
             AND location_name <> ''
             AND (geo_confidence IS NULL OR geo_confidence <> 'amap_geocode')
           ORDER BY created_at DESC
           LIMIT $1`,
          [LIMIT]
        );

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows.rows) {
      const { addressCandidates, cityHint } = buildAddressCandidates(row);
      if (!addressCandidates.length) {
        skipped += 1;
        continue;
      }

      try {
        const hit = await geocodeWithFallback(addressCandidates, cityHint);
        if (!hit) {
          skipped += 1;
          await sleep(REQUEST_INTERVAL_MS);
          continue;
        }

        await client.query(
          `UPDATE posts
           SET lat = $1,
               lng = $2,
               geo_confidence = $3,
               district = COALESCE(NULLIF(district, ''), $4)
           WHERE id = $5`,
          [hit.lat, hit.lng, 'amap_geocode', row.district || null, row.id]
        );

        success += 1;
      } catch (error) {
        failed += 1;
        console.warn(`⚠️ geocode 失败 post_id=${row.id} note_id=${row.source_note_id}: ${error.message}`);
      }

      await sleep(REQUEST_INTERVAL_MS);
    }

    const after = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT (lat::text || ',' || lng::text))::int AS unique_points
       FROM posts
       WHERE source_platform = 'xiaohongshu'`
    );

    const sample = await client.query(
      `SELECT id, source_note_id, city, location_name, lat, lng, geo_confidence
       FROM posts
       WHERE source_platform = 'xiaohongshu'
       ORDER BY created_at DESC
       LIMIT 12`
    );

    console.log(JSON.stringify({
      amapKeyTails: AMAP_WEB_SERVICE_KEYS.map((k) => k.slice(-6)),
      before: before.rows[0],
      processed: rows.rows.length,
      success,
      skipped,
      failed,
      after: after.rows[0],
      sample: sample.rows
    }, null, 2));
  } finally {
    client.release();
    await closePgPool();
  }
}

run().catch((error) => {
  console.error('❌ 高德地理编码回填失败:', error.message);
  process.exitCode = 1;
});
