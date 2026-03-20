import dotenv from 'dotenv';
import axios from 'axios';
import { pgQuery, isPostgresEnabled } from './pg-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

const AMAP_WEB_SERVICE_KEYS = (process.env.AMAP_WEB_SERVICE_KEYS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

const AMAP_GEOCODE_URL = 'https://restapi.amap.com/v3/geocode/geo';
const AMAP_PLACE_TEXT_URL = 'https://restapi.amap.com/v3/place/text';
const REQUEST_INTERVAL_MS = 220;
const REQUEST_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLocation(locationText) {
  const [lngRaw, latRaw] = String(locationText || '').split(',');
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeByAmap(key, address, city) {
  const response = await axios.get(AMAP_GEOCODE_URL, {
    params: {
      key,
      address,
      city: city || undefined
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
    level: first.level || null
  };
}

async function searchPlaceByAmap(key, keywords, city) {
  const response = await axios.get(AMAP_PLACE_TEXT_URL, {
    params: {
      key,
      keywords,
      city: city || undefined,
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
    province: first.pname || null,
    city: first.cityname || null,
    district: first.adname || null,
    level: 'poi'
  };
}

async function geocodeAddress(address, city) {
  let lastError = null;

  for (const key of AMAP_WEB_SERVICE_KEYS) {
    try {
      // 先尝试地理编码
      const geo = await geocodeByAmap(key, address, city);
      if (geo) return geo;
    } catch (error) {
      lastError = error;
      const msg = String(error.message || '');
      if (/CUQPS_HAS_EXCEEDED_THE_LIMIT|USER_DAILY_QUERY_OVER_LIMIT/i.test(msg)) {
        await sleep(1500);
      }
    }

    try {
      // 再尝试POI搜索
      const poi = await searchPlaceByAmap(key, address, city);
      if (poi) return poi;
    } catch (error) {
      lastError = error;
      const msg = String(error.message || '');
      if (/CUQPS_HAS_EXCEEDED_THE_LIMIT|USER_DAILY_QUERY_OVER_LIMIT/i.test(msg)) {
        await sleep(1500);
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function regeocodeAllPosts() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    if (!AMAP_WEB_SERVICE_KEYS.length) {
      console.error('❌ 缺少高德地图 API Key');
      process.exit(1);
    }

    console.log('🗺️  开始重新地理编码所有贴文...\n');
    console.log(`📍 使用 ${AMAP_WEB_SERVICE_KEYS.length} 个高德API Key\n`);

    // 查询所有有位置信息的贴文
    const query = `
      SELECT id, city, district, location_name, lat, lng
      FROM posts
      WHERE location_name IS NOT NULL 
        AND location_name <> ''
      ORDER BY id ASC
    `;

    const result = await pgQuery(query);
    const posts = result.rows;

    console.log(`📊 找到 ${posts.length} 条需要处理的贴文\n`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const progress = `[${i + 1}/${posts.length}]`;

      // 构建地址查询
      const city = post.city || '';
      const district = post.district || '';
      const locationName = post.location_name || '';
      
      // 尝试多种地址组合
      const addressCandidates = [];
      if (locationName) {
        addressCandidates.push(locationName);
        if (city && !locationName.includes(city)) {
          addressCandidates.push(`${city}${locationName}`);
        }
        if (city && district && !locationName.includes(district)) {
          addressCandidates.push(`${city}${district}${locationName}`);
        }
      }

      if (!addressCandidates.length) {
        console.log(`${progress} ⏭️  跳过 ID ${post.id} - 无有效地址`);
        skipped++;
        continue;
      }

      let geocoded = false;
      for (const address of addressCandidates) {
        try {
          console.log(`${progress} 🔍 处理 ID ${post.id}: ${address}`);
          
          const result = await geocodeAddress(address, city);
          
          if (result) {
            // 更新数据库
            await pgQuery(
              `UPDATE posts 
               SET lat = $1, lng = $2, geo_confidence = 'amap_geocode'
               WHERE id = $3`,
              [result.lat, result.lng, post.id]
            );

            console.log(`${progress} ✅ 成功 - 坐标: ${result.lat}, ${result.lng}`);
            success++;
            geocoded = true;
            break;
          }
        } catch (error) {
          console.log(`${progress} ⚠️  尝试失败: ${error.message}`);
        }

        await sleep(REQUEST_INTERVAL_MS);
      }

      if (!geocoded) {
        console.log(`${progress} ❌ 失败 ID ${post.id} - 所有地址候选都无法解析`);
        failed++;
      }

      await sleep(REQUEST_INTERVAL_MS);
    }

    console.log('\n📊 处理完成！');
    console.log(`   成功: ${success}`);
    console.log(`   失败: ${failed}`);
    console.log(`   跳过: ${skipped}`);
    console.log(`   总计: ${posts.length}`);

  } catch (error) {
    console.error('❌ 处理失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

regeocodeAllPosts();
