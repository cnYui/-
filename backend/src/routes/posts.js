import { Router } from 'express'
import { getPgPool } from '../database/pg-client.js'
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js'

const router = Router()

function toNumber(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

function parseMaybeJson(value, fallback = []) {
    if (!value) return fallback
    if (Array.isArray(value)) return value
    try {
        return JSON.parse(value)
    } catch {
        return fallback
    }
}

function mapPostRecord(post) {
    const imageUrls = parseMaybeJson(post.image_urls, post.image_url ? [post.image_url] : [])
    return {
        id: post.id,
        userId: post.user_id,
        planId: post.plan_id,
        title: post.title || null,
        content: post.content,
        imageUrl: post.image_url,
        imageUrls,
        imageCount: imageUrls.length,
        mood: post.mood,
        category: post.category || null,
        tags: post.tags || null,
        city: post.city,
        district: post.district,
        locationName: post.location_name,
        lat: toNumber(post.lat),
        lng: toNumber(post.lng),
        createdAt: post.created_at,
        sourcePlatform: post.source_platform || null,
        sourceNoteId: post.source_note_id || null
    }
}

function inferCategoryFromText(text = '') {
    const source = String(text)
    if (/(美食|咖啡|奶茶|餐厅|火锅|小吃|甜品|吃|饭)/i.test(source)) return '吃'
    if (/(citywalk|街区|拍照|书店|展览|逛|夜市)/i.test(source)) return '逛'
    return '玩'
}

/**
 * POST /api/posts - 发布贴文
 */
router.post('/', requireAuthenticatedUser, async (req, res) => {
    try {
        const { planId, content, imageUrl, mood, city, district, locationName, lat, lng } = req.body
        const userId = getAuthenticatedUserId(req)
        const category = inferCategoryFromText(content || '')

        if (!userId || !city || lat === undefined || lng === undefined) {
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const pool = getPgPool()
        const insert = await pool.query(`
            INSERT INTO posts (user_id, plan_id, content, image_url, image_count, image_urls, mood, category, city, district, location_name, lat, lng)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            userId,
            planId || null,
            content || '',
            imageUrl || null,
            imageUrl ? 1 : 0,
            JSON.stringify(imageUrl ? [imageUrl] : []),
            mood || null,
            category,
            city,
            district || null,
            locationName || null,
            toNumber(lat),
            toNumber(lng)
        ])

        const post = mapPostRecord(insert.rows[0])
        return res.json({ success: true, data: post })
    } catch (error) {
        console.error('❌ 发布贴文失败:', error)
        res.status(500).json({ success: false, error: '发布贴文失败' })
    }
})

/**
 * GET /api/posts/user/:userId - 获取用户贴文
 */
router.get('/user/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params
        const pool = getPgPool()
        const result = await pool.query(`
            SELECT * FROM posts
            WHERE user_id = $1
            ORDER BY created_at DESC
        `, [userId])

        return res.json({ success: true, data: result.rows.map(mapPostRecord) })
    } catch (error) {
        console.error('❌ 获取用户贴文失败:', error)
        res.status(500).json({ success: false, error: '获取贴文失败' })
    }
})

/**
 * GET /api/posts/detail/:postId - 获取单条贴文详情
 */
router.get('/detail/:postId', async (req, res) => {
    try {
        const { postId } = req.params
        const pool = getPgPool()
        const result = await pool.query(`
            SELECT p.*, u.username, u.nickname, u.avatar
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1 AND p.is_public = 1
            LIMIT 1
        `, [postId])
        const row = result.rows[0]

        if (!row) {
            return res.status(404).json({ success: false, error: '贴文不存在' })
        }

        return res.json({
            success: true,
            data: {
                ...mapPostRecord(row),
                username: row.username,
                nickname: row.nickname,
                avatar: row.avatar
            }
        })
    } catch (error) {
        console.error('❌ 获取贴文详情失败:', error)
        return res.status(500).json({ success: false, error: '获取贴文详情失败' })
    }
})

/**
 * GET /api/posts/:postId - 兼容旧路径（仅数字ID）
 */
router.get('/:postId(\\d+)', async (req, res) => {
    try {
        const { postId } = req.params
        const pool = getPgPool()
        const result = await pool.query(`
            SELECT p.*, u.username, u.nickname, u.avatar
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1 AND p.is_public = 1
            LIMIT 1
        `, [postId])
        const row = result.rows[0]

        if (!row) {
            return res.status(404).json({ success: false, error: '贴文不存在' })
        }

        return res.json({
            success: true,
            data: {
                ...mapPostRecord(row),
                username: row.username,
                nickname: row.nickname,
                avatar: row.avatar
            }
        })
    } catch (error) {
        console.error('❌ 获取贴文详情失败（legacy）:', error)
        return res.status(500).json({ success: false, error: '获取贴文详情失败' })
    }
})

/**
 * GET /api/posts/nearby - 获取附近贴文
 * Query: lat, lng, radius (米)
 */
router.get('/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 1000, excludeUserId } = req.query

        if (!lat || !lng) {
            return res.status(400).json({ success: false, error: '缺少位置参数' })
        }

        const pool = getPgPool()
        const params = [toNumber(lat), toNumber(lng)]
        let excludeClause = ''

        if (excludeUserId) {
            params.push(Number(excludeUserId))
            excludeClause = ` AND p.user_id != $${params.length}`
        }

        const result = await pool.query(`
            SELECT p.*, u.username, u.nickname, u.avatar,
                (
                    6371000 * acos(
                        LEAST(1, GREATEST(-1,
                            cos(radians($1)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians($2)) +
                            sin(radians($1)) * sin(radians(p.lat))
                        ))
                    )
                ) AS distance
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.is_public = 1
            ${excludeClause}
            ORDER BY distance ASC
            LIMIT 800
        `, params)

        const nearbyPosts = result.rows
            .map(row => ({
                ...mapPostRecord(row),
                username: row.username,
                nickname: row.nickname,
                avatar: row.avatar,
                distance: Math.round(toNumber(row.distance))
            }))
            .filter(post => post.distance <= toNumber(radius))

        return res.json({ success: true, data: nearbyPosts })
    } catch (error) {
        console.error('❌ 获取附近贴文失败:', error)
        res.status(500).json({ success: false, error: '获取附近贴文失败' })
    }
})

/**
 * GET /api/posts/city-summary - 城市聚合统计（含粗分类）
 */
router.get('/city-summary', async (req, res) => {
    try {
        const pool = getPgPool()
        const result = await pool.query(`
            SELECT city,
                   COALESCE(NULLIF(category, ''), '玩') AS category,
                   COUNT(*)::int AS post_count
            FROM posts
            WHERE is_public = 1
            GROUP BY city, COALESCE(NULLIF(category, ''), '玩')
            ORDER BY city ASC, post_count DESC
        `)

        return res.json({ success: true, data: result.rows })
    } catch (error) {
        console.error('❌ 获取城市聚合统计失败:', error)
        return res.status(500).json({ success: false, error: '获取城市聚合统计失败' })
    }
})

/**
 * GET /api/posts/city/:city - 获取城市贴文
 */
router.get('/city/:city', async (req, res) => {
    try {
        const { city } = req.params

        const pool = getPgPool()
        const result = await pool.query(`
            SELECT p.*, u.username, u.nickname, u.avatar
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.city = $1 AND p.is_public = 1
            ORDER BY p.created_at DESC
        `, [city])

        return res.json({
            success: true,
            data: result.rows.map(post => ({
                ...mapPostRecord(post),
                username: post.username,
                nickname: post.nickname,
                avatar: post.avatar
            }))
        })
    } catch (error) {
        console.error('❌ 获取城市贴文失败:', error)
        res.status(500).json({ success: false, error: '获取城市贴文失败' })
    }
})

/**
 * DELETE /api/posts/:postId - 删除贴文
 */
router.delete('/:postId', requireAuthenticatedUser, async (req, res) => {
    try {
        const { postId } = req.params
        const userId = getAuthenticatedUserId(req)
        const pool = getPgPool()
        const postResult = await pool.query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [postId])
        const post = postResult.rows[0]

        if (!post) {
            return res.status(404).json({ success: false, error: '贴文不存在' })
        }

        if (String(post.user_id) !== String(userId)) {
            return res.status(403).json({ success: false, error: '无权删除此贴文' })
        }

        await pool.query('DELETE FROM posts WHERE id = $1', [postId])

        return res.json({ success: true })
    } catch (error) {
        console.error('❌ 删除贴文失败:', error)
        res.status(500).json({ success: false, error: '删除贴文失败' })
    }
})

export default router
