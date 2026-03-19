import { Router } from 'express'
import { getPgPool } from '../database/pg-client.js'
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js'

const router = Router()

function parseExtraData(raw) {
    if (!raw) return null
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (error) {
        return null
    }
}

/**
 * GET /api/mails/user/:userId - 获取用户邮件列表
 * Query: type (可选，筛选类型)
 */
router.get('/user/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params
        const { type } = req.query

        const pool = getPgPool()

        let query = `
            SELECT * FROM mails 
            WHERE user_id = $1
        `
        const params = [userId]

        if (type) {
            query += ` AND mail_type = $${params.length + 1}`
            params.push(type)
        }

        query += ' ORDER BY created_at DESC'

        const result = await pool.query(query, params)
        const mails = result.rows

        res.json({
            success: true,
            data: mails.map(mail => ({
                id: mail.id,
                userId: mail.user_id,
                senderType: mail.sender_type,
                senderId: mail.sender_id,
                mailType: mail.mail_type,
                title: mail.title,
                content: mail.content,
                imageUrl: mail.image_url,
                extraData: parseExtraData(mail.extra_data),
                isRead: mail.is_read === 1,
                createdAt: mail.created_at
            }))
        })
    } catch (error) {
        console.error('❌ 获取邮件列表失败:', error)
        res.status(500).json({ success: false, error: '获取邮件列表失败' })
    }
})

/**
 * GET /api/mails/:mailId - 获取邮件详情
 */
router.get('/:mailId', requireAuthenticatedUser, async (req, res) => {
    try {
        const { mailId } = req.params

        const pool = getPgPool()
        const result = await pool.query('SELECT * FROM mails WHERE id = $1 LIMIT 1', [mailId])
        const mail = result.rows[0]

        if (!mail) {
            return res.status(404).json({ success: false, error: '邮件不存在' })
        }

        if (String(mail.user_id) !== getAuthenticatedUserId(req)) {
            return res.status(403).json({ success: false, error: '无权访问其他用户邮件' })
        }

        res.json({
            success: true,
            data: {
                id: mail.id,
                userId: mail.user_id,
                senderType: mail.sender_type,
                senderId: mail.sender_id,
                mailType: mail.mail_type,
                title: mail.title,
                content: mail.content,
                imageUrl: mail.image_url,
                extraData: parseExtraData(mail.extra_data),
                isRead: mail.is_read === 1,
                createdAt: mail.created_at
            }
        })
    } catch (error) {
        console.error('❌ 获取邮件详情失败:', error)
        res.status(500).json({ success: false, error: '获取邮件详情失败' })
    }
})

/**
 * PUT /api/mails/:mailId/read - 标记邮件已读
 */
router.put('/:mailId/read', requireAuthenticatedUser, async (req, res) => {
    try {
        const { mailId } = req.params

        const userId = getAuthenticatedUserId(req)
        const pool = getPgPool()
        const result = await pool.query(
            'UPDATE mails SET is_read = 1 WHERE id = $1 AND user_id = $2',
            [mailId, userId]
        )

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: '邮件不存在或无权操作' })
        }

        res.json({ success: true })
    } catch (error) {
        console.error('❌ 标记邮件已读失败:', error)
        res.status(500).json({ success: false, error: '标记邮件已读失败' })
    }
})

/**
 * POST /api/mails - 创建邮件（内部使用）
 */
router.post('/', requireAuthenticatedUser, async (req, res) => {
    try {
        const { senderType, senderId, mailType, title, content, imageUrl, extraData } = req.body
        const userId = getAuthenticatedUserId(req)

        if (!userId || !mailType || !title || !content) {
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const pool = getPgPool()
        const result = await pool.query(
            `INSERT INTO mails (user_id, sender_type, sender_id, mail_type, title, content, image_url, extra_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
             RETURNING *`,
            [
                userId,
                senderType || 'system',
                senderId || null,
                mailType,
                title,
                content,
                imageUrl || null,
                extraData ? JSON.stringify(extraData) : JSON.stringify({})
            ]
        )
        const mail = result.rows[0]

        console.log(`✅ 邮件创建成功: mailId=${mail.id}, type=${mailType}`)

        res.json({
            success: true,
            data: {
                id: mail.id,
                userId: mail.user_id,
                mailType: mail.mail_type,
                title: mail.title,
                createdAt: mail.created_at
            }
        })
    } catch (error) {
        console.error('❌ 创建邮件失败:', error)
        res.status(500).json({ success: false, error: '创建邮件失败' })
    }
})

/**
 * GET /api/mails/user/:userId/unread-count - 获取未读邮件数量
 */
router.get('/user/:userId/unread-count', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params

        const pool = getPgPool()
        const result = await pool.query(
            `SELECT COUNT(*)::int as count FROM mails 
             WHERE user_id = $1 AND is_read = 0`,
            [userId]
        )

        res.json({
            success: true,
            data: { count: result.rows[0]?.count || 0 }
        })
    } catch (error) {
        console.error('❌ 获取未读邮件数量失败:', error)
        res.status(500).json({ success: false, error: '获取未读邮件数量失败' })
    }
})

export default router
