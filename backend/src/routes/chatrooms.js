import { Router } from 'express'
import { callDeepSeek } from '../services/deepseek.js'
import { getPgPool } from '../database/pg-client.js'
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js'

const router = Router()

/**
 * Haversine 公式计算两点距离（米）
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3 // 地球半径（米）
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lng2 - lng1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
}

/**
 * 生成聊天室名称
 */
function generateChatroomName(city, district, locationName) {
    if (district && locationName) {
        return `${district}·${locationName}附近`
    } else if (district) {
        return `${district}`
    } else {
        return `${city}`
    }
}

/**
 * POST /api/chatrooms/create-by-location - 基于位置创建聊天室
 */
router.post('/create-by-location', requireAuthenticatedUser, async (req, res) => {
    try {
        const { postId, city, district, lat, lng, radius = 1000 } = req.body
        const userId = getAuthenticatedUserId(req)

        if (!userId || !postId || !city || lat === undefined || lng === undefined) {
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const pool = getPgPool()
        const triggerPostResult = await pool.query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [postId])
        const triggerPost = triggerPostResult.rows[0]

        if (!triggerPost) {
            return res.status(404).json({ success: false, error: '贴文不存在' })
        }

        const allPostsResult = await pool.query(`
            SELECT p.*, u.username, u.nickname, u.avatar
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.city = $1 AND p.is_public = 1 AND p.user_id != $2
        `, [city, userId])

        const nearbyPosts = allPostsResult.rows
            .map(post => ({
                ...post,
                distance: Math.round(calculateDistance(Number(lat), Number(lng), Number(post.lat), Number(post.lng)))
            }))
            .filter(post => post.distance <= Number(radius))
            .sort((a, b) => a.distance - b.distance)

        const matchedUsersMap = new Map()
        nearbyPosts.forEach(post => {
            if (!matchedUsersMap.has(post.user_id)) {
                matchedUsersMap.set(post.user_id, {
                    userId: post.user_id,
                    username: post.username,
                    nickname: post.nickname,
                    avatar: post.avatar,
                    postId: post.id,
                    location: post.location_name,
                    distance: post.distance,
                    postContent: post.content
                })
            }
        })
        const matchedUsers = Array.from(matchedUsersMap.values())

        const chatroomName = generateChatroomName(city, district, triggerPost.location_name)
        const inserted = await pool.query(`
            INSERT INTO chatrooms (user_id, trigger_post_id, chatroom_name, city, district, location_name, center_lat, center_lng, radius, member_count, last_active_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING id
        `, [
            userId,
            postId,
            chatroomName,
            city,
            district || null,
            triggerPost.location_name || null,
            Number(lat),
            Number(lng),
            Number(radius),
            matchedUsers.length + 1
        ])

        const chatroomId = inserted.rows[0].id

        await pool.query(`
            INSERT INTO chatroom_members (chatroom_id, user_id, post_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (chatroom_id, user_id) DO NOTHING
        `, [chatroomId, userId, postId])

        for (const user of matchedUsers) {
            await pool.query(`
                INSERT INTO chatroom_members (chatroom_id, user_id, post_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (chatroom_id, user_id) DO NOTHING
            `, [chatroomId, user.userId, user.postId])
        }

        const systemMessage = matchedUsers.length > 0
            ? `你在${triggerPost.location_name || city}发布了帖子，发现${matchedUsers.length}位附近的旅行者`
            : `你在${triggerPost.location_name || city}发布了帖子，你是第一个在这里发帖的人`

        await pool.query(`
            INSERT INTO chatroom_messages (chatroom_id, user_id, is_ai_agent, content, message_type)
            VALUES ($1, $2, 0, $3, 'system')
        `, [chatroomId, userId, systemMessage])

        console.log(`✅ 聊天室创建成功: chatroomId=${chatroomId}, 成员数=${matchedUsers.length + 1}`)

        res.json({
            success: true,
            data: {
                chatroomId,
                chatroomName,
                matchedUsers
            }
        })
    } catch (error) {
        console.error('❌ 创建聊天室失败:', error)
        res.status(500).json({ success: false, error: '创建聊天室失败' })
    }
})

/**
 * GET /api/chatrooms/user/:userId - 获取用户的聊天室列表
 */
router.get('/user/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), (req, res) => {
    try {
        const { userId } = req.params

        const pool = getPgPool()
        pool.query(`
            SELECT c.*,
                   (
                       SELECT COUNT(*)::int FROM chatroom_messages cm
                       WHERE cm.chatroom_id = c.id
                       AND cm.created_at > COALESCE(
                           (SELECT last_read_at FROM chatroom_members WHERE chatroom_id = c.id AND user_id = $1 LIMIT 1),
                           TIMESTAMPTZ '1970-01-01'
                       )
                   ) AS unread_count
            FROM chatrooms c
            JOIN chatroom_members m ON c.id = m.chatroom_id
            WHERE m.user_id = $1 AND c.is_archived = 0
            ORDER BY c.last_active_at DESC NULLS LAST, c.created_at DESC
        `, [userId]).then((result) => {
            res.json({
                success: true,
                data: result.rows.map(c => ({
                    id: c.id,
                    chatroomName: c.chatroom_name,
                    city: c.city,
                    district: c.district,
                    locationName: c.location_name,
                    memberCount: c.member_count,
                    lastMessage: c.last_message,
                    lastSender: c.last_sender,
                    lastActiveAt: c.last_active_at,
                    unreadCount: c.unread_count,
                    createdAt: c.created_at
                }))
            })
        }).catch((error) => {
            console.error('❌ 获取聊天室列表失败:', error)
            res.status(500).json({ success: false, error: '获取聊天室列表失败' })
        })
        return
    } catch (error) {
        console.error('❌ 获取聊天室列表失败:', error)
        res.status(500).json({ success: false, error: '获取聊天室列表失败' })
    }
})

/**
 * GET /api/chatrooms/:chatroomId/detail - 获取聊天室详情
 */
router.get('/:chatroomId/detail', requireAuthenticatedUser, async (req, res) => {
    try {
        const { chatroomId } = req.params
        const userId = getAuthenticatedUserId(req)

        const pool = getPgPool()
        const membershipResult = await pool.query(
            'SELECT 1 FROM chatroom_members WHERE chatroom_id = $1 AND user_id = $2 LIMIT 1',
            [chatroomId, userId]
        )

        if (membershipResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: '无权访问该聊天室' })
        }

        const chatroomResult = await pool.query('SELECT * FROM chatrooms WHERE id = $1 LIMIT 1', [chatroomId])
        const chatroom = chatroomResult.rows[0]

        if (!chatroom) {
            return res.status(404).json({ success: false, error: '聊天室不存在' })
        }

        const membersResult = await pool.query(`
            SELECT m.*, u.username, u.nickname, u.avatar
            FROM chatroom_members m
            JOIN users u ON m.user_id = u.id
            WHERE m.chatroom_id = $1
        `, [chatroomId])

        const messagesResult = await pool.query(`
            SELECT cm.*, u.username, u.nickname, u.avatar
            FROM chatroom_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.chatroom_id = $1
            ORDER BY cm.created_at ASC
        `, [chatroomId])

        return res.json({
            success: true,
            data: {
                chatroom: {
                    id: chatroom.id,
                    chatroomName: chatroom.chatroom_name,
                    city: chatroom.city,
                    district: chatroom.district,
                    memberCount: chatroom.member_count,
                    createdAt: chatroom.created_at
                },
                members: membersResult.rows.map(m => ({
                    userId: m.user_id,
                    username: m.username,
                    nickname: m.nickname,
                    avatar: m.avatar,
                    isCreator: m.user_id === chatroom.user_id
                })),
                messages: messagesResult.rows.map(m => ({
                    id: m.id,
                    userId: m.user_id,
                    username: m.username,
                    nickname: m.nickname,
                    avatar: m.avatar,
                    isAiAgent: Number(m.is_ai_agent) === 1,
                    content: m.content,
                    messageType: m.message_type,
                    relatedPostId: m.related_post_id,
                    createdAt: m.created_at
                }))
            }
        })
    } catch (error) {
        console.error('❌ 获取聊天室详情失败:', error)
        res.status(500).json({ success: false, error: '获取聊天室详情失败' })
    }
})

/**
 * POST /api/chatrooms/message - 发送消息
 */
router.post('/message', requireAuthenticatedUser, async (req, res) => {
    try {
        const { chatroomId, content, isAiAgent = false } = req.body
        const userId = getAuthenticatedUserId(req)

        if (!chatroomId || !userId || !content) {
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const pool = getPgPool()
        const membershipResult = await pool.query(
            'SELECT 1 FROM chatroom_members WHERE chatroom_id = $1 AND user_id = $2 LIMIT 1',
            [chatroomId, userId]
        )

        if (membershipResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: '无权在该聊天室发送消息' })
        }

        const result = await pool.query(`
            INSERT INTO chatroom_messages (chatroom_id, user_id, is_ai_agent, content, message_type)
            VALUES ($1, $2, $3, $4, 'text')
            RETURNING *
        `, [chatroomId, userId, isAiAgent ? 1 : 0, content])

        const userResult = await pool.query('SELECT nickname FROM users WHERE id = $1 LIMIT 1', [userId])
        const user = userResult.rows[0]

        await pool.query(`
            UPDATE chatrooms
            SET last_message = $1, last_sender = $2, last_active_at = NOW()
            WHERE id = $3
        `, [content.substring(0, 50), user?.nickname || '用户', chatroomId])

        const message = result.rows[0]
        return res.json({
            success: true,
            data: {
                id: message.id,
                chatroomId: message.chatroom_id,
                userId: message.user_id,
                content: message.content,
                isAiAgent: Number(message.is_ai_agent) === 1,
                createdAt: message.created_at
            }
        })
    } catch (error) {
        console.error('❌ 发送消息失败:', error)
        res.status(500).json({ success: false, error: '发送消息失败' })
    }
})

/**
 * POST /api/chatrooms/generate-responses - 生成 AI 分身回复
 */
router.post('/generate-responses', requireAuthenticatedUser, async (req, res) => {
    try {
        const { chatroomId, triggerMessage } = req.body
        const triggerUserId = getAuthenticatedUserId(req)

        if (!chatroomId || !triggerUserId || !triggerMessage) {
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const pool = getPgPool()
        const membershipResult = await pool.query(
            'SELECT 1 FROM chatroom_members WHERE chatroom_id = $1 AND user_id = $2 LIMIT 1',
            [chatroomId, triggerUserId]
        )

        if (membershipResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: '无权触发该聊天室回复' })
        }

        const chatroomResult = await pool.query('SELECT * FROM chatrooms WHERE id = $1 LIMIT 1', [chatroomId])
        const chatroom = chatroomResult.rows[0]

        if (!chatroom) {
            return res.status(404).json({ success: false, error: '聊天室不存在' })
        }

        const otherMembersResult = await pool.query(`
            SELECT m.*, u.username, u.nickname, u.avatar, p.content as post_content, p.location_name
            FROM chatroom_members m
            JOIN users u ON m.user_id = u.id
            JOIN posts p ON m.post_id = p.id
            WHERE m.chatroom_id = $1 AND m.user_id != $2
        `, [chatroomId, triggerUserId])
        const otherMembers = otherMembersResult.rows

        if (otherMembers.length === 0) {
            return res.json({ success: true, data: { responses: [] } })
        }

        const responses = []

        for (const member of otherMembers.slice(0, 2)) {
            const memoriesResult = await pool.query(
                'SELECT category, content FROM user_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
                [member.user_id]
            )
            const memoriesText = memoriesResult.rows.map(m => `${m.category}: ${m.content}`).join('\n')

            const systemPrompt = `你是用户的数字分身，正在一个基于地理位置的群聊中。

【你的角色】
- 用户名：${member.nickname}
- 你的记忆：${memoriesText || '暂无'}
- 你在这里发的帖子：${member.post_content || '暂无'}

【重要规则】
1. 根据对方的消息，自然回复
2. 如果对方提到想去某类地方，推荐你知道的地点
3. 推荐时要具体：地点名称 + 为什么推荐
4. 语气自然、友好，像本地朋友推荐
5. 每次回复 20-80 字

【输出格式】
直接输出回复内容，不要JSON格式`

            const userPrompt = `对方说：${triggerMessage}

请自然回复：`

            try {
                const response = await callDeepSeek(systemPrompt, userPrompt, {
                    temperature: 0.8,
                    max_tokens: 200
                })

                const inserted = await pool.query(`
                    INSERT INTO chatroom_messages (chatroom_id, user_id, is_ai_agent, content, message_type)
                    VALUES ($1, $2, 1, $3, 'text')
                    RETURNING id, created_at
                `, [chatroomId, member.user_id, response])

                await pool.query(`
                    UPDATE chatrooms
                    SET last_message = $1, last_sender = $2, last_active_at = NOW()
                    WHERE id = $3
                `, [response.substring(0, 50), `${member.nickname}的分身`, chatroomId])

                responses.push({
                    id: inserted.rows[0].id,
                    userId: member.user_id,
                    username: member.username,
                    nickname: member.nickname,
                    avatar: member.avatar,
                    isAiAgent: true,
                    content: response,
                    createdAt: inserted.rows[0].created_at
                })
            } catch (aiError) {
                console.error(`❌ 生成 ${member.nickname} 的回复失败:`, aiError)
            }
        }

        console.log(`✅ 生成 ${responses.length} 条 AI 回复`)

        return res.json({
            success: true,
            data: { responses }
        })
    } catch (error) {
        console.error('❌ 生成 AI 回复失败:', error)
        res.status(500).json({ success: false, error: '生成 AI 回复失败' })
    }
})

/**
 * PUT /api/chatrooms/:chatroomId/read - 标记聊天室已读
 */
router.put('/:chatroomId/read', requireAuthenticatedUser, async (req, res) => {
    try {
        const { chatroomId } = req.params
        const userId = getAuthenticatedUserId(req)

        const pool = getPgPool()
        await pool.query(`
            UPDATE chatroom_members
            SET last_read_at = NOW()
            WHERE chatroom_id = $1 AND user_id = $2
        `, [chatroomId, userId])

        return res.json({ success: true })
    } catch (error) {
        console.error('❌ 标记聊天室已读失败:', error)
        res.status(500).json({ success: false, error: '标记聊天室已读失败' })
    }
})

export default router
