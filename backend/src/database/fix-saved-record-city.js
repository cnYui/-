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

async function reverseGeocode(lat, lng) {
  if (!AMAP_WEB_SERVICE_KEYS.length) {
    throw new Error('缺少高德地图API Key');
  }

  const key = AMAP_WEB_SERVICE_KEYS[0];
  const response = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
    params: {
      key,
      location: `${lng},${lat}`,
      extensions: 'base'
    },
    timeout: 10000
  });

  const data = response.data || {};
  if (String(data.status) !== '1') {
    throw new Error(`高德逆地理编码失败: ${data.info || 'unknown'}`);
  }

  const addressComponent = data.regeocode?.addressComponent || {};
  return {
    city: addressComponent.city || addressComponent.province || '未知城市',
    district: addressComponent.district || null,
    province: addressComponent.province || null
  };
}

async function fixSavedRecordCity() {
  try {
    if (!isPostgresEnabled()) {
      console.error('❌ 请确保使用 PostgreSQL 数据库');
      process.exit(1);
    }

    console.log('🔧 修复保存记录的城市信息...\n');

    // 查询所有city无效的记录
    const records = await pgQuery(`
      SELECT id, lat, lng, city, location_name
      FROM saved_post_records
      WHERE city IS NULL OR city = '' OR city = '未知城市'
    `);

    console.log(`找到 ${records.rows.length} 条需要修复的记录\n`);

    for (const record of records.rows) {
      console.log(`处理记录 ID ${record.id}...`);
      console.log(`  当前城市: ${record.city || '空'}`);
      console.log(`  坐标: [${record.lat}, ${record.lng}]`);

      try {
        const geocode = await reverseGeocode(record.lat, record.lng);
        console.log(`  查询结果: ${geocode.city} ${geocode.district || ''}`);

        await pgQuery(`
          UPDATE saved_post_records
          SET city = $1, district = COALESCE(district, $2)
          WHERE id = $3
        `, [geocode.city, geocode.district, record.id]);

        console.log(`  ✅ 已更新为: ${geocode.city}\n`);
      } catch (error) {
        console.log(`  ❌ 查询失败: ${error.message}\n`);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 验证修复结果
    const fixed = await pgQuery(`
      SELECT id, city, district, location_name
      FROM saved_post_records
      WHERE id IN (${records.rows.map(r => r.id).join(',')})
    `);

    console.log('📋 修复后的数据:');
    fixed.rows.forEach(record => {
      console.log(`  ID ${record.id}: ${record.city} ${record.district || ''} ${record.location_name}`);
    });

  } catch (error) {
    console.error('❌ 修复失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixSavedRecordCity();
