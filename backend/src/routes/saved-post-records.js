import { Router } from 'express'
import { getPgPool } from '../database/pg-client.js'
import { getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js'
import { generateSavedPostRecordMovieImage } from '../services/stepfun.js'

const router = Router()

const ENSURE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS saved_post_records (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_mode TEXT DEFAULT 'text',
  original_image_url TEXT,
  generated_image_url TEXT,
  movie_name TEXT,
  style_analysis JSONB,
  generation_prompt TEXT,
  mood TEXT,
  city TEXT NOT NULL,
  district TEXT,
  location_name TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  visit_time TIMESTAMPTZ NOT NULL,
  generation_status TEXT DEFAULT 'pending',
  generation_error TEXT,
  published_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)`

let ensureTablePromise = null

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseMaybeJson(value, fallback = []) {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function inferCategoryFromText(text = '') {
  const source = String(text)
  if (/(美食|咖啡|奶茶|餐厅|火锅|小吃|甜品|吃|饭)/i.test(source)) return '吃'
  if (/(citywalk|街区|拍照|书店|展览|逛|夜市)/i.test(source)) return '逛'
  return '玩'
}

async function ensureSavedPostRecordsTable() {
  if (!ensureTablePromise) {
    const pool = getPgPool()
    ensureTablePromise = (async () => {
      await pool.query(ENSURE_TABLE_SQL)
      await pool.query('ALTER TABLE saved_post_records ADD COLUMN IF NOT EXISTS movie_name TEXT')
      await pool.query('ALTER TABLE saved_post_records ADD COLUMN IF NOT EXISTS style_analysis JSONB')
      await pool.query('ALTER TABLE saved_post_records ADD COLUMN IF NOT EXISTS generation_prompt TEXT')
      await pool.query('CREATE INDEX IF NOT EXISTS idx_saved_post_records_user_id ON saved_post_records(user_id)')
      await pool.query('CREATE INDEX IF NOT EXISTS idx_saved_post_records_created_at ON saved_post_records(created_at)')
    })().catch((error) => {
      ensureTablePromise = null
      throw error
    })
  }

  await ensureTablePromise
}

function mapSavedRecord(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    title: row.title || '',
    content: row.content || '',
    sourceMode: row.source_mode || 'text',
    originalImageUrl: row.original_image_url || null,
    generatedImageUrl: row.generated_image_url || null,
    movieName: row.movie_name || '',
    styleAnalysis: parseMaybeJson(row.style_analysis, null),
    generationPrompt: row.generation_prompt || null,
    mood: row.mood || null,
    city: row.city,
    district: row.district || null,
    locationName: row.location_name || null,
    lat: toNumber(row.lat),
    lng: toNumber(row.lng),
    visitTime: row.visit_time,
    generationStatus: row.generation_status || 'pending',
    generationError: row.generation_error || null,
    publishedPostId: row.published_post_id ? Number(row.published_post_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function loadOwnedRecord(pool, recordId, userId) {
  const result = await pool.query(
    'SELECT * FROM saved_post_records WHERE id = $1 AND user_id = $2 LIMIT 1',
    [recordId, userId]
  )
  return result.rows[0] || null
}

router.get('/', requireAuthenticatedUser, async (req, res) => {
  try {
    await ensureSavedPostRecordsTable()
    const userId = getAuthenticatedUserId(req)
    const pool = getPgPool()
    const result = await pool.query(
      `SELECT *
       FROM saved_post_records
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    )

    return res.json({ success: true, data: result.rows.map(mapSavedRecord) })
  } catch (error) {
    console.error('❌ 获取保存记录失败:', error)
    return res.status(500).json({ success: false, error: '获取保存记录失败' })
  }
})

router.get('/:recordId', requireAuthenticatedUser, async (req, res) => {
  try {
    await ensureSavedPostRecordsTable()
    const { recordId } = req.params
    const userId = getAuthenticatedUserId(req)
    const pool = getPgPool()
    const record = await loadOwnedRecord(pool, recordId, userId)

    if (!record) {
      return res.status(404).json({ success: false, error: '保存记录不存在' })
    }

    return res.json({ success: true, data: mapSavedRecord(record) })
  } catch (error) {
    console.error('❌ 获取保存记录详情失败:', error)
    return res.status(500).json({ success: false, error: '获取保存记录详情失败' })
  }
})

router.post('/', requireAuthenticatedUser, async (req, res) => {
  try {
    await ensureSavedPostRecordsTable()
    const userId = getAuthenticatedUserId(req)
    const {
      title,
      content,
      sourceMode,
      originalImageUrl,
      mood,
      city,
      district,
      locationName,
      lat,
      lng,
      visitTime
    } = req.body || {}

    if (!title || !content || !city || lat === undefined || lng === undefined || !visitTime || !mood || !locationName) {
      return res.status(400).json({ success: false, error: '缺少必要参数' })
    }

    const pool = getPgPool()
    const inserted = await pool.query(
      `INSERT INTO saved_post_records (
         user_id, title, content, source_mode, original_image_url,
         mood, city, district, location_name, lat, lng, visit_time,
         generation_status
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12,
         'pending'
       )
       RETURNING *`,
      [
        userId,
        String(title || '').trim(),
        String(content || '').trim(),
        String(sourceMode || 'text').trim() || 'text',
        originalImageUrl || null,
        mood,
        city,
        district || null,
        locationName,
        toNumber(lat),
        toNumber(lng),
        visitTime
      ]
    )

    return res.json({ success: true, data: mapSavedRecord(inserted.rows[0]) })
  } catch (error) {
    console.error('❌ 保存记录失败:', error)
    return res.status(500).json({ success: false, error: '保存记录失败' })
  }
})

router.post('/:recordId/generate-image', requireAuthenticatedUser, async (req, res) => {
  try {
    await ensureSavedPostRecordsTable()
    const { recordId } = req.params
    const { movieName } = req.body || {}
    const normalizedMovieName = String(movieName || '').trim()
    const userId = getAuthenticatedUserId(req)

    if (!normalizedMovieName) {
      return res.status(400).json({ success: false, error: '请输入影视作品名称' })
    }

    const pool = getPgPool()
    const record = await loadOwnedRecord(pool, recordId, userId)

    if (!record) {
      return res.status(404).json({ success: false, error: '保存记录不存在' })
    }

    const processing = await pool.query(
      `UPDATE saved_post_records
       SET generation_status = 'processing',
           generation_error = NULL,
           movie_name = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [normalizedMovieName, record.id]
    )

    try {
      const generationResult = await generateSavedPostRecordMovieImage(processing.rows[0], normalizedMovieName)
      const updated = await pool.query(
        `UPDATE saved_post_records
         SET generated_image_url = $1,
             movie_name = $2,
             style_analysis = $3::jsonb,
             generation_prompt = $4,
             generation_status = 'success',
             generation_error = NULL,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          generationResult.imageUrl,
          normalizedMovieName,
          JSON.stringify(generationResult.styleAnalysis || null),
          generationResult.prompt || null,
          record.id
        ]
      )

      return res.json({ success: true, data: mapSavedRecord(updated.rows[0]) })
    } catch (generationError) {
      const failed = await pool.query(
        `UPDATE saved_post_records
         SET movie_name = $1,
             generation_status = 'failed',
             generation_error = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [normalizedMovieName, generationError.message, record.id]
      )

      return res.json({
        success: false,
        error: generationError.message,
        data: mapSavedRecord(failed.rows[0])
      })
    }
  } catch (error) {
    console.error('❌ 手动生成保存记录图片失败:', error)
    return res.status(500).json({ success: false, error: '手动生成保存记录图片失败' })
  }
})

router.post('/:recordId/publish', requireAuthenticatedUser, async (req, res) => {
  const pool = getPgPool()
  const client = await pool.connect()
  let transactionStarted = false

  try {
    console.log(`📤 开始发布保存记录: recordId=${req.params.recordId}`)
    await ensureSavedPostRecordsTable()
    const { recordId } = req.params
    const userId = getAuthenticatedUserId(req)
    console.log(`  用户ID: ${userId}`)
    
    const record = await loadOwnedRecord(pool, recordId, userId)

    if (!record) {
      console.log(`  ❌ 记录不存在`)
      return res.status(404).json({ success: false, error: '保存记录不存在' })
    }

    console.log(`  记录信息: 标题="${record.title}", 城市="${record.city}", 地点="${record.location_name}"`)

    if (record.published_post_id) {
      console.log(`  ℹ️  记录已发布过，帖子ID: ${record.published_post_id}`)
      const existing = await pool.query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [record.published_post_id])
      if (existing.rows[0]) {
        return res.json({
          success: true,
          data: {
            record: mapSavedRecord(record),
            post: {
              id: existing.rows[0].id,
              userId: existing.rows[0].user_id,
              title: existing.rows[0].title || null,
              content: existing.rows[0].content,
              imageUrl: existing.rows[0].image_url,
              imageUrls: parseMaybeJson(existing.rows[0].image_urls, existing.rows[0].image_url ? [existing.rows[0].image_url] : []),
              mood: existing.rows[0].mood,
              category: existing.rows[0].category || null,
              city: existing.rows[0].city,
              district: existing.rows[0].district,
              locationName: existing.rows[0].location_name,
              lat: toNumber(existing.rows[0].lat),
              lng: toNumber(existing.rows[0].lng),
              createdAt: existing.rows[0].created_at
            }
          }
        })
      }
    }

    const primaryImageUrl = record.generated_image_url || record.original_image_url || null
    const imageUrls = [record.generated_image_url, record.original_image_url].filter(Boolean)
    const category = inferCategoryFromText(`${record.title || ''} ${record.content || ''}`)

    console.log(`  图片信息: 主图="${primaryImageUrl}", 图片数=${imageUrls.length}`)
    console.log(`  分类: ${category}`)

    await client.query('BEGIN')
    transactionStarted = true

    console.log(`  开始插入帖子...`)
    const inserted = await client.query(
      `INSERT INTO posts (
         user_id, title, content, image_url, image_count, image_urls,
         mood, category, city, district, location_name, lat, lng, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb,
         $7, $8, $9, $10, $11, $12, $13, $14
       )
       RETURNING *`,
      [
        userId,
        record.title || null,
        record.content || '',
        primaryImageUrl,
        imageUrls.length,
        JSON.stringify(imageUrls),
        record.mood || null,
        category,
        record.city,
        record.district || null,
        record.location_name || null,
        toNumber(record.lat),
        toNumber(record.lng),
        record.visit_time || new Date().toISOString()
      ]
    )

    const post = inserted.rows[0]
    console.log(`  ✅ 帖子创建成功: ID=${post.id}`)

    await client.query(
      `UPDATE saved_post_records
       SET published_post_id = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [post.id, record.id]
    )

    console.log(`  ✅ 更新保存记录的published_post_id`)

    await client.query('COMMIT')
    transactionStarted = false

    console.log(`  ✅ 事务提交成功`)
    console.log(`📤 发布完成: 记录ID=${record.id}, 帖子ID=${post.id}`)

    return res.json({
      success: true,
      data: {
        record: {
          ...mapSavedRecord(record),
          publishedPostId: post.id
        },
        post: {
          id: post.id,
          userId: post.user_id,
          title: post.title || null,
          content: post.content,
          imageUrl: post.image_url,
          imageUrls: parseMaybeJson(post.image_urls, post.image_url ? [post.image_url] : []),
          mood: post.mood,
          category: post.category || null,
          city: post.city,
          district: post.district,
          locationName: post.location_name,
          lat: toNumber(post.lat),
          lng: toNumber(post.lng),
          createdAt: post.created_at
        }
      }
    })
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK')
    }
    console.error('❌ 发布保存记录失败:', error)
    return res.status(500).json({ success: false, error: '发布保存记录失败' })
  } finally {
    client.release()
  }
})

router.delete('/:recordId', requireAuthenticatedUser, async (req, res) => {
  try {
    await ensureSavedPostRecordsTable()
    const { recordId } = req.params
    const userId = getAuthenticatedUserId(req)
    const pool = getPgPool()
    const result = await pool.query(
      'DELETE FROM saved_post_records WHERE id = $1 AND user_id = $2',
      [recordId, userId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: '保存记录不存在或无权删除' })
    }

    return res.json({ success: true, data: { changes: result.rowCount } })
  } catch (error) {
    console.error('❌ 删除保存记录失败:', error)
    return res.status(500).json({ success: false, error: '删除保存记录失败' })
  }
})

export default router
