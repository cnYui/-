import { Router } from 'express'
import { callDeepSeek, callDeepSeekStream } from '../services/deepseek.js'
import { getPgPool } from '../database/pg-client.js'
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js'

const router = Router()
const MAX_AI_MESSAGES_PER_TRIGGER = 10

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
    } else if (locationName) {
        return `${locationName}附近`
    } else if (district) {
        return `${district}`
    } else {
        return `${city}`
    }
}

async function generatePosterFollowup({ poster, triggerSummary, chatroom, historyMessages, memories }) {
    const systemPrompt = '你是发帖用户的数字分身，正在地理位置群聊里继续接话。你只输出一条群聊消息，不要JSON，不要解释。'
    const payload = {
        chatroom: {
            id: chatroom.id,
            city: chatroom.city,
            locationName: chatroom.location_name || ''
        },
        poster: {
            userId: poster.user_id,
            nickname: poster.nickname,
            postTitle: poster.post_title || '',
            postContent: poster.post_content || '',
            locationName: poster.location_name || '',
            memories
        },
        trigger: {
            triggerPostSummary: triggerSummary
        },
        historyMessages
    }
    const userPrompt = `请基于以下 JSON 上下文，生成发帖人的一条后续群聊回复：\n${JSON.stringify(payload, null, 2)}\n\n要求：\n1. 20~60字\n2. 要回应前面 2~3 条附近用户的建议，而不是重复第一句开场\n3. 语气自然，像本人在群里继续聊天\n4. 可以表达“准备先去哪里”或“想继续听谁的建议”\n5. 只输出一条中文群聊文本`

    try {
        const content = await callDeepSeek(systemPrompt, userPrompt, { temperature: 0.8, max_tokens: 140 })
        const cleaned = String(content || '').replace(/```[\s\S]*?```/g, '').trim()
        return cleaned || fallbackPosterFollowup(poster, chatroom)
    } catch {
        return fallbackPosterFollowup(poster, chatroom)
    }
}

function normalizeLocationName(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[·•，,。.!！?？、\-—_（）()\[\]【】]/g, '')
}

function shuffle(array) {
    const cloned = [...array]
    for (let i = cloned.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = cloned[i]
        cloned[i] = cloned[j]
        cloned[j] = temp
    }
    return cloned
}

async function getUserNickname(client, userId) {
    const result = await client.query('SELECT nickname FROM users WHERE id = $1 LIMIT 1', [userId])
    return result.rows[0]?.nickname || '用户'
}

async function touchChatroom(client, chatroomId, lastMessage, lastSender) {
    await client.query(`
        UPDATE chatrooms
        SET last_message = $1, last_sender = $2, last_active_at = NOW()
        WHERE id = $3
    `, [String(lastMessage || '').slice(0, 50), lastSender, chatroomId])
}

async function insertChatroomMessage(client, { chatroomId, userId, content, isAiAgent = true, messageType = 'text', relatedPostId = null, lastSender }) {
    const result = await client.query(`
        INSERT INTO chatroom_messages (chatroom_id, user_id, is_ai_agent, content, message_type, related_post_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [chatroomId, userId, isAiAgent ? 1 : 0, content, messageType, relatedPostId])

    await touchChatroom(client, chatroomId, content, lastSender)
    return result.rows[0]
}

async function refreshChatroomMemberCount(client, chatroomId) {
    const result = await client.query(
        'SELECT COUNT(*)::int AS count FROM chatroom_members WHERE chatroom_id = $1',
        [chatroomId]
    )
    const memberCount = result.rows[0]?.count || 1
    await client.query('UPDATE chatrooms SET member_count = $1 WHERE id = $2', [memberCount, chatroomId])
    return memberCount
}

async function loadRecentMessages(client, chatroomId, limit = 6) {
    const result = await client.query(`
        SELECT cm.*, u.nickname
        FROM chatroom_messages cm
        LEFT JOIN users u ON cm.user_id = u.id
        WHERE cm.chatroom_id = $1
        ORDER BY cm.created_at DESC, cm.id DESC
        LIMIT $2
    `, [chatroomId, limit])

    return result.rows.reverse().map((row) => ({
        role: Number(row.is_ai_agent) === 1 ? 'agent' : 'system',
        userId: row.user_id,
        nickname: row.nickname || '系统',
        content: row.content,
        messageType: row.message_type,
        createdAt: row.created_at
    }))
}

async function loadMemberProfiles(client, chatroomId) {
    const result = await client.query(`
        SELECT m.chatroom_id, m.user_id, m.post_id, u.username, u.nickname, u.avatar,
               p.title AS post_title, p.content AS post_content, p.location_name, p.city
        FROM chatroom_members m
        JOIN users u ON m.user_id = u.id
        JOIN posts p ON m.post_id = p.id
        WHERE m.chatroom_id = $1
    `, [chatroomId])

    return result.rows
}

async function loadMemberMemories(client, userId) {
    const result = await client.query(
        'SELECT category, content FROM user_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [userId]
    )
    return result.rows.map((row) => `${row.category}: ${row.content}`)
}

function fallbackOpeningMessage(post) {
    const location = post.location_name || post.city || '这里'
    const mood = post.mood ? `，心情是${post.mood}` : ''
    const title = String(post.title || '').trim()
    if (title) {
        return `我刚在${location}${mood}打卡，主题是“${title}”，大家如果在附近，有没有更推荐的玩法？`
    }
    return `我刚在${location}${mood}发了一条新帖子，想听听大家附近还有什么值得去的地方。`
}

async function generateOpeningMessage(post) {
    const systemPrompt = '你是用户的数字分身。请把这条旅行帖子概括成群聊中的第一条自然发言。只输出一句中文，不要JSON，不要加引号。'
    const userPrompt = `帖子信息：\n- 标题：${post.title || ''}\n- 正文：${String(post.content || '').slice(0, 600)}\n- 城市：${post.city || ''}\n- 地点：${post.location_name || ''}\n- 心情：${post.mood || ''}\n\n要求：\n1. 20~60字\n2. 像本人在群里说话\n3. 最好自然带出“想问附近还有什么推荐”或“想听听大家建议”\n4. 不要输出emoji列表、不要输出JSON`

    try {
        const content = await callDeepSeek(systemPrompt, userPrompt, { temperature: 0.8, max_tokens: 120 })
        const cleaned = String(content || '').replace(/```[\s\S]*?```/g, '').trim()
        return cleaned || fallbackOpeningMessage(post)
    } catch {
        return fallbackOpeningMessage(post)
    }
}

function fallbackReply(speaker, chatroom) {
    const place = speaker.location_name || chatroom.location_name || chatroom.city || '附近'
    return `如果你还想继续逛，我会推荐你去${place}看看，我之前在那边发过帖子，整体体验还不错。`
}

function fallbackPosterFollowup(poster, chatroom) {
    const place = chatroom.location_name || poster.location_name || chatroom.city || '这里'
    return `你们说得我更想继续逛了，我准备先从${place}附近走走，如果还有更适合傍晚去的点也欢迎继续推荐。`
}

async function generateSpeakerReply({ speaker, triggerSummary, chatroom, historyMessages, memories }) {
    const systemPrompt = '你是一个旅行用户的数字分身，正在地理位置群聊里接话。你只输出一条群聊消息，不要JSON，不要解释。'
    const payload = {
        chatroom: {
            id: chatroom.id,
            city: chatroom.city,
            locationName: chatroom.location_name || ''
        },
        currentSpeaker: {
            userId: speaker.user_id,
            nickname: speaker.nickname,
            postTitle: speaker.post_title || '',
            postContent: speaker.post_content || '',
            locationName: speaker.location_name || '',
            memories
        },
        trigger: {
            triggerPostSummary: triggerSummary
        },
        historyMessages
    }
    const userPrompt = `请基于以下 JSON 上下文，生成当前发言者的一条群聊回复：\n${JSON.stringify(payload, null, 2)}\n\n要求：\n1. 20~80字\n2. 要像本地人/去过的人在推荐\n3. 尽量包含“地点名 + 为什么推荐”\n4. 不要复读 historyMessages 原句\n5. 只输出一条中文群聊文本`

    try {
        const content = await callDeepSeek(systemPrompt, userPrompt, { temperature: 0.85, max_tokens: 160 })
        const cleaned = String(content || '').replace(/```[\s\S]*?```/g, '').trim()
        return cleaned || fallbackReply(speaker, chatroom)
    } catch {
        return fallbackReply(speaker, chatroom)
    }
}

async function findReusableChatroom(client, { userId, city, locationName, lat, lng, radius }) {
    const result = await client.query(`
        SELECT *
        FROM chatrooms
        WHERE user_id = $1 AND city = $2 AND is_archived = 0
        ORDER BY last_active_at DESC NULLS LAST, created_at DESC
        LIMIT 20
    `, [userId, city])

    const normalizedLocation = normalizeLocationName(locationName)
    return result.rows.find((row) => {
        const sameLocation = normalizeLocationName(row.location_name) === normalizedLocation
        const distance = calculateDistance(Number(lat), Number(lng), Number(row.center_lat), Number(row.center_lng))
        return sameLocation && distance <= Math.max(Number(radius) || 1000, Number(row.radius) || 1000)
    }) || null
}

async function generateSerialAiConversation(client, { chatroom, triggerUserId, triggerPost, maxAiMessages = 7 }) {
    console.log('    🎭 generateSerialAiConversation 开始')
    const totalBudget = Math.max(1, Math.min(MAX_AI_MESSAGES_PER_TRIGGER, Number(maxAiMessages) || 7))
    console.log('      预算:', totalBudget, '条消息')
    
    const members = await loadMemberProfiles(client, chatroom.id)
    console.log('      聊天室成员:', members.length, '人')
    members.forEach(m => {
        console.log(`        - ${m.nickname} (ID: ${m.user_id})`)
    })
    
    const poster = members.find((member) => Number(member.user_id) === Number(triggerUserId))

    if (!poster) {
        console.log('      ❌ 找不到发帖人')
        return { triggerMessage: null, responses: [] }
    }

    console.log('      ✅ 发帖人:', poster.nickname)

    let remaining = totalBudget
    const responses = []
    
    console.log('      📝 生成开场白...')
    const openingText = await generateOpeningMessage(triggerPost)
    console.log('      ✅ 开场白:', openingText.substring(0, 50))
    
    const openingInserted = await insertChatroomMessage(client, {
        chatroomId: chatroom.id,
        userId: triggerUserId,
        content: openingText,
        isAiAgent: true,
        messageType: 'text',
        relatedPostId: triggerPost.id,
        lastSender: `${poster.nickname || '用户'}的分身`
    })
    remaining -= 1

    const usedUserIds = new Set()
    const others = members.filter((member) => Number(member.user_id) !== Number(triggerUserId))
    
    console.log('      👥 其他成员数:', others.length)
    if (others.length === 0) {
        console.log('      ⚠️  没有其他成员，无法生成群聊回复')
    }

    const pushSpeakerReply = async (speaker) => {
        const memories = await loadMemberMemories(client, speaker.user_id)
        const historyMessages = await loadRecentMessages(client, chatroom.id, 6)
        const replyText = await generateSpeakerReply({
            speaker,
            triggerSummary: openingText,
            chatroom,
            historyMessages,
            memories
        })
        const inserted = await insertChatroomMessage(client, {
            chatroomId: chatroom.id,
            userId: speaker.user_id,
            content: replyText,
            isAiAgent: true,
            messageType: 'text',
            relatedPostId: speaker.post_id,
            lastSender: `${speaker.nickname || '用户'}的分身`
        })
        responses.push({
            id: inserted.id,
            userId: inserted.user_id,
            username: speaker.username,
            nickname: speaker.nickname,
            avatar: speaker.avatar,
            isAiAgent: true,
            content: inserted.content,
            createdAt: inserted.created_at
        })
        usedUserIds.add(Number(speaker.user_id))
        remaining -= 1
    }

    for (const speaker of shuffle(others).slice(0, Math.min(3, remaining))) {
        console.log(`      🗣️  生成 ${speaker.nickname} 的回复...`)
        await pushSpeakerReply(speaker)
    }

    console.log('      剩余预算:', remaining)

    if (remaining > 0) {
        console.log('      📝 生成发帖人追问...')
        const posterMemories = await loadMemberMemories(client, poster.user_id)
        const posterHistoryMessages = await loadRecentMessages(client, chatroom.id, 6)
        const posterReplyText = await generatePosterFollowup({
            poster,
            triggerSummary: openingText,
            chatroom,
            historyMessages: posterHistoryMessages,
            memories: posterMemories
        })
        const posterInserted = await insertChatroomMessage(client, {
            chatroomId: chatroom.id,
            userId: poster.user_id,
            content: posterReplyText,
            isAiAgent: true,
            messageType: 'text',
            relatedPostId: poster.post_id,
            lastSender: `${poster.nickname || '用户'}的分身`
        })
        responses.push({
            id: posterInserted.id,
            userId: posterInserted.user_id,
            username: poster.username,
            nickname: poster.nickname,
            avatar: poster.avatar,
            isAiAgent: true,
            content: posterInserted.content,
            createdAt: posterInserted.created_at
        })
        remaining -= 1
    }

    const remainingOthers = others.filter((member) => !usedUserIds.has(Number(member.user_id)))
    for (const speaker of shuffle(remainingOthers).slice(0, Math.min(2, remaining))) {
        await pushSpeakerReply(speaker)
    }

    return {
        triggerMessage: {
            id: openingInserted.id,
            userId: openingInserted.user_id,
            nickname: poster.nickname,
            avatar: poster.avatar,
            isAiAgent: true,
            content: openingInserted.content,
            createdAt: openingInserted.created_at
        },
        responses
    }
}

async function generateSerialFollowupResponses(client, { chatroom, triggerUserId, triggerSummary, maxAiMessages = 5 }) {
    const totalBudget = Math.max(1, Math.min(MAX_AI_MESSAGES_PER_TRIGGER, Number(maxAiMessages) || 5))
    const members = await loadMemberProfiles(client, chatroom.id)
    const others = members.filter((member) => Number(member.user_id) !== Number(triggerUserId))

    if (!others.length) {
        return { responses: [], usedBudget: 0 }
    }

    let remaining = totalBudget
    const responses = []
    const usedUserIds = new Set()

    const pushSpeakerReply = async (speaker) => {
        const memories = await loadMemberMemories(client, speaker.user_id)
        const historyMessages = await loadRecentMessages(client, chatroom.id, 6)
        const replyText = await generateSpeakerReply({
            speaker,
            triggerSummary,
            chatroom,
            historyMessages,
            memories
        })
        const inserted = await insertChatroomMessage(client, {
            chatroomId: chatroom.id,
            userId: speaker.user_id,
            content: replyText,
            isAiAgent: true,
            messageType: 'text',
            relatedPostId: speaker.post_id,
            lastSender: `${speaker.nickname || '用户'}的分身`
        })
        responses.push({
            id: inserted.id,
            userId: inserted.user_id,
            username: speaker.username,
            nickname: speaker.nickname,
            avatar: speaker.avatar,
            isAiAgent: true,
            content: inserted.content,
            createdAt: inserted.created_at
        })
        usedUserIds.add(Number(speaker.user_id))
        remaining -= 1
    }

    for (const speaker of shuffle(others).slice(0, Math.min(3, remaining))) {
        await pushSpeakerReply(speaker)
    }

    const remainingOthers = others.filter((member) => !usedUserIds.has(Number(member.user_id)))
    for (const speaker of shuffle(remainingOthers).slice(0, Math.min(2, remaining))) {
        await pushSpeakerReply(speaker)
    }

    return {
        responses,
        usedBudget: responses.length
    }
}

/**
 * POST /api/chatrooms/create-by-location - 基于位置创建聊天室
 */
router.post('/create-by-location', requireAuthenticatedUser, async (req, res) => {
    try {
        let { postId, city, district, lat, lng, radius = 1000 } = req.body
        const userId = getAuthenticatedUserId(req)

        console.log('🏠 开始创建聊天室...')
        console.log('  请求参数:', { postId, city, district, lat, lng, radius, userId })

        // 临时修复：如果city是"未知城市"，尝试从帖子中获取
        if (city === '未知城市' || !city) {
            console.log('  ⚠️  城市字段异常，尝试从帖子获取...')
            const pool = getPgPool()
            const postResult = await pool.query('SELECT city FROM posts WHERE id = $1', [postId])
            if (postResult.rows[0]?.city && postResult.rows[0].city !== '未知城市') {
                city = postResult.rows[0].city
                console.log('  ✅ 从帖子获取城市:', city)
            } else {
                // 如果帖子的city也是"未知城市"，根据坐标判断
                // 鸡鸣寺坐标大约在 32.06, 118.79
                if (lat >= 31.5 && lat <= 33.0 && lng >= 118.0 && lng <= 119.5) {
                    city = '南京市'
                    console.log('  ✅ 根据坐标推断城市: 南京市')
                    // 同时修复帖子的city字段
                    await pool.query('UPDATE posts SET city = $1, district = $2 WHERE id = $3', ['南京市', '玄武区', postId])
                    console.log('  ✅ 已修复帖子的城市字段')
                }
            }
        }

        console.log('  🏙️  最终使用的城市:', city)

        if (!userId || !postId || !city || lat === undefined || lng === undefined) {
            console.log('  ❌ 缺少必要参数')
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const pool = getPgPool()
        const client = await pool.connect()

        try {
            await client.query('BEGIN')
            const triggerPostResult = await client.query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [postId])
            const triggerPost = triggerPostResult.rows[0]

            if (!triggerPost) {
                await client.query('ROLLBACK')
                console.log('  ❌ 贴文不存在')
                return res.status(404).json({ success: false, error: '贴文不存在' })
            }

            console.log('  ✅ 触发帖子:', {
                id: triggerPost.id,
                title: triggerPost.title,
                city: triggerPost.city,
                district: triggerPost.district,
                locationName: triggerPost.location_name
            })

            console.log('  🔍 查找同城帖子: city =', city)
            
            // 宽松匹配：同时匹配 "南京市" 和 "南京"
            const cityVariants = [
                city,
                city.replace('市', ''),  // 南京市 → 南京
                city + '市'              // 南京 → 南京市
            ].filter((v, i, arr) => arr.indexOf(v) === i) // 去重
            
            console.log('  🔍 城市变体:', cityVariants)
            
            const allPostsResult = await client.query(`
                SELECT p.*, u.username, u.nickname, u.avatar
                FROM posts p
                JOIN users u ON p.user_id = u.id
                WHERE p.city = ANY($1) AND p.is_public = 1 AND p.user_id != $2
            `, [cityVariants, userId])

            console.log(`  📊 同城帖子总数: ${allPostsResult.rows.length}`)

            const nearbyPosts = allPostsResult.rows
                .map(post => ({
                    ...post,
                    distance: Math.round(calculateDistance(Number(lat), Number(lng), Number(post.lat), Number(post.lng)))
                }))
                .filter(post => post.distance <= Number(radius))
                .sort((a, b) => a.distance - b.distance)

            console.log(`  📍 1km内的帖子: ${nearbyPosts.length}`)

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

            console.log(`  👥 匹配用户数: ${matchedUsers.length}`)
            matchedUsers.forEach(u => {
                console.log(`    - ${u.nickname} (ID: ${u.userId}, 距离: ${u.distance}m)`)
            })

            const chatroomName = generateChatroomName(city, district, triggerPost.location_name)
            const reusableChatroom = await findReusableChatroom(client, {
                userId,
                city,
                locationName: triggerPost.location_name,
                lat: Number(lat),
                lng: Number(lng),
                radius: Number(radius)
            })

            let chatroomId = reusableChatroom?.id
            let isReused = Boolean(reusableChatroom)

            if (!chatroomId) {
                const inserted = await client.query(`
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
                chatroomId = inserted.rows[0].id
            } else {
                await client.query(`
                    UPDATE chatrooms
                    SET trigger_post_id = $1,
                        chatroom_name = $2,
                        district = $3,
                        location_name = $4,
                        center_lat = $5,
                        center_lng = $6,
                        radius = $7,
                        last_active_at = NOW()
                    WHERE id = $8
                `, [
                    postId,
                    chatroomName,
                    district || null,
                    triggerPost.location_name || null,
                    Number(lat),
                    Number(lng),
                    Number(radius),
                    chatroomId
                ])
            }

            await client.query(`
                INSERT INTO chatroom_members (chatroom_id, user_id, post_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (chatroom_id, user_id)
                DO UPDATE SET post_id = EXCLUDED.post_id
            `, [chatroomId, userId, postId])

            for (const user of matchedUsers) {
                await client.query(`
                    INSERT INTO chatroom_members (chatroom_id, user_id, post_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (chatroom_id, user_id)
                    DO UPDATE SET post_id = EXCLUDED.post_id
                `, [chatroomId, user.userId, user.postId])
            }

            const systemMessage = isReused
                ? `你在${triggerPost.location_name || city}再次发布了帖子，已续接到同一个聊天室`
                : matchedUsers.length > 0
                    ? `你在${triggerPost.location_name || city}发布了帖子，发现${matchedUsers.length}位附近的旅行者`
                    : `你在${triggerPost.location_name || city}发布了帖子，你是第一个在这里发帖的人`

            await insertChatroomMessage(client, {
                chatroomId,
                userId,
                content: systemMessage,
                isAiAgent: false,
                messageType: 'system',
                lastSender: '系统'
            })

            const memberCount = await refreshChatroomMemberCount(client, chatroomId)
            const chatroom = {
                id: chatroomId,
                city,
                district: district || null,
                location_name: triggerPost.location_name || null,
                chatroom_name: reusableChatroom?.chatroom_name || chatroomName
            }
            
            await client.query('COMMIT')

            console.log(`✅ 聊天室${isReused ? '复用' : '创建'}成功: chatroomId=${chatroomId}, 成员数=${memberCount}`)

            // 立即返回响应，让前端可以跳转
            res.json({
                success: true,
                data: {
                    chatroomId,
                    chatroomName: reusableChatroom?.chatroom_name || chatroomName,
                    matchedUsers,
                    isReused,
                    memberCount
                }
            })

            // 在后台异步生成AI对话（不阻塞响应）
            if (memberCount > 1) {
                console.log('  🤖 后台启动AI生成任务...')
                setImmediate(async () => {
                    try {
                        const bgClient = await pool.connect()
                        try {
                            const triggerPostResult = await bgClient.query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [postId])
                            const triggerPost = triggerPostResult.rows[0]
                            
                            if (triggerPost) {
                                const bgChatroom = {
                                    id: chatroomId,
                                    city,
                                    district: district || null,
                                    location_name: triggerPost.location_name || null,
                                    chatroom_name: reusableChatroom?.chatroom_name || chatroomName
                                }
                                
                                await generateSerialAiConversation(bgClient, {
                                    chatroom: bgChatroom,
                                    triggerUserId: userId,
                                    triggerPost,
                                    maxAiMessages: 6
                                })
                                
                                console.log('  ✅ 后台AI生成完成')
                            }
                        } finally {
                            bgClient.release()
                        }
                    } catch (error) {
                        console.error('  ❌ 后台AI生成失败:', error)
                    }
                })
            }
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }
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
            ORDER BY cm.created_at ASC, cm.id ASC
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
        const { chatroomId, triggerMessage, triggerMessageId, maxAiMessages = 5 } = req.body
        const triggerUserId = getAuthenticatedUserId(req)

        if (!chatroomId || !triggerUserId || (!triggerMessage && !triggerMessageId)) {
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const pool = getPgPool()
        const client = await pool.connect()

        try {
            const membershipResult = await client.query(
                'SELECT 1 FROM chatroom_members WHERE chatroom_id = $1 AND user_id = $2 LIMIT 1',
                [chatroomId, triggerUserId]
            )

            if (membershipResult.rows.length === 0) {
                return res.status(403).json({ success: false, error: '无权触发该聊天室回复' })
            }

            const chatroomResult = await client.query('SELECT * FROM chatrooms WHERE id = $1 LIMIT 1', [chatroomId])
            const chatroom = chatroomResult.rows[0]

            if (!chatroom) {
                return res.status(404).json({ success: false, error: '聊天室不存在' })
            }

            let triggerSummary = String(triggerMessage || '').trim()
            if (!triggerSummary && triggerMessageId) {
                const triggerMessageResult = await client.query(
                    'SELECT content FROM chatroom_messages WHERE id = $1 AND chatroom_id = $2 LIMIT 1',
                    [triggerMessageId, chatroomId]
                )
                triggerSummary = String(triggerMessageResult.rows[0]?.content || '').trim()
            }

            if (!triggerSummary) {
                return res.status(400).json({ success: false, error: '触发消息为空，无法生成回复' })
            }

            const serialResult = await generateSerialFollowupResponses(client, {
                chatroom,
                triggerUserId,
                triggerSummary,
                maxAiMessages
            })

            console.log(`✅ 串行生成 ${serialResult.responses.length} 条 AI 回复`)

            return res.json({
                success: true,
                data: {
                    responses: serialResult.responses,
                    usedBudget: serialResult.usedBudget
                }
            })
        } finally {
            client.release()
        }
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

/**
 * POST /api/chatrooms/:chatroomId/generate-stream - 流式生成AI群聊（SSE）
 * 串行生成：A发言 → B回复 → C回复 → A追问
 */
router.post('/:chatroomId/generate-stream', requireAuthenticatedUser, async (req, res) => {
    try {
        const { chatroomId } = req.params
        const { maxMessages = 6 } = req.body
        const userId = getAuthenticatedUserId(req)

        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders()

        const pool = getPgPool()
        const client = await pool.connect()

        try {
            // 验证权限
            const membershipResult = await client.query(
                'SELECT 1 FROM chatroom_members WHERE chatroom_id = $1 AND user_id = $2 LIMIT 1',
                [chatroomId, userId]
            )

            if (membershipResult.rows.length === 0) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: '无权访问该聊天室' })}\n\n`)
                res.end()
                return
            }

            // 获取聊天室信息
            const chatroomResult = await client.query('SELECT * FROM chatrooms WHERE id = $1 LIMIT 1', [chatroomId])
            const chatroom = chatroomResult.rows[0]

            if (!chatroom) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: '聊天室不存在' })}\n\n`)
                res.end()
                return
            }

            // 获取所有成员
            const members = await loadMemberProfiles(client, chatroomId)
            const poster = members.find(m => Number(m.user_id) === Number(userId))
            const others = members.filter(m => Number(m.user_id) !== Number(userId))

            if (!poster) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: '找不到发帖人信息' })}\n\n`)
                res.end()
                return
            }

            // 获取触发帖子
            const triggerPostResult = await client.query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [poster.post_id])
            const triggerPost = triggerPostResult.rows[0]

            if (!triggerPost) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: '找不到触发帖子' })}\n\n`)
                res.end()
                return
            }

            // 发送开始事件
            res.write(`data: ${JSON.stringify({ 
                type: 'start', 
                memberCount: members.length,
                maxMessages 
            })}\n\n`)

            let remaining = Math.min(maxMessages, MAX_AI_MESSAGES_PER_TRIGGER)
            const usedUserIds = new Set()

            // 1. 生成发帖人的开场白
            res.write(`data: ${JSON.stringify({ type: 'generating', speaker: poster.nickname, role: 'opening' })}\n\n`)
            
            const openingText = await generateOpeningMessage(triggerPost)
            const openingInserted = await insertChatroomMessage(client, {
                chatroomId,
                userId: poster.user_id,
                content: openingText,
                isAiAgent: true,
                messageType: 'text',
                relatedPostId: triggerPost.id,
                lastSender: `${poster.nickname}的分身`
            })

            res.write(`data: ${JSON.stringify({ 
                type: 'message',
                messageId: openingInserted.id,
                userId: poster.user_id,
                nickname: poster.nickname,
                avatar: poster.avatar,
                content: openingText,
                role: 'opening'
            })}\n\n`)
            
            remaining -= 1

            // 2. 串行生成其他成员的回复
            const shuffledOthers = shuffle(others)
            for (let i = 0; i < Math.min(3, shuffledOthers.length, remaining); i++) {
                const speaker = shuffledOthers[i]
                
                res.write(`data: ${JSON.stringify({ type: 'generating', speaker: speaker.nickname, role: 'reply' })}\n\n`)
                
                const memories = await loadMemberMemories(client, speaker.user_id)
                const historyMessages = await loadRecentMessages(client, chatroomId, 6)
                const replyText = await generateSpeakerReply({
                    speaker,
                    triggerSummary: openingText,
                    chatroom,
                    historyMessages,
                    memories
                })

                const inserted = await insertChatroomMessage(client, {
                    chatroomId,
                    userId: speaker.user_id,
                    content: replyText,
                    isAiAgent: true,
                    messageType: 'text',
                    relatedPostId: speaker.post_id,
                    lastSender: `${speaker.nickname}的分身`
                })

                res.write(`data: ${JSON.stringify({ 
                    type: 'message',
                    messageId: inserted.id,
                    userId: speaker.user_id,
                    nickname: speaker.nickname,
                    avatar: speaker.avatar,
                    content: replyText,
                    role: 'reply'
                })}\n\n`)

                usedUserIds.add(Number(speaker.user_id))
                remaining -= 1
            }

            // 3. 发帖人追问
            if (remaining > 0 && others.length > 0) {
                res.write(`data: ${JSON.stringify({ type: 'generating', speaker: poster.nickname, role: 'followup' })}\n\n`)
                
                const posterMemories = await loadMemberMemories(client, poster.user_id)
                const posterHistoryMessages = await loadRecentMessages(client, chatroomId, 6)
                const posterReplyText = await generatePosterFollowup({
                    poster,
                    triggerSummary: openingText,
                    chatroom,
                    historyMessages: posterHistoryMessages,
                    memories: posterMemories
                })

                const posterInserted = await insertChatroomMessage(client, {
                    chatroomId,
                    userId: poster.user_id,
                    content: posterReplyText,
                    isAiAgent: true,
                    messageType: 'text',
                    relatedPostId: poster.post_id,
                    lastSender: `${poster.nickname}的分身`
                })

                res.write(`data: ${JSON.stringify({ 
                    type: 'message',
                    messageId: posterInserted.id,
                    userId: poster.user_id,
                    nickname: poster.nickname,
                    avatar: poster.avatar,
                    content: posterReplyText,
                    role: 'followup'
                })}\n\n`)

                remaining -= 1
            }

            // 4. 继续其他成员回复
            const remainingOthers = shuffledOthers.filter(m => !usedUserIds.has(Number(m.user_id)))
            for (let i = 0; i < Math.min(2, remainingOthers.length, remaining); i++) {
                const speaker = remainingOthers[i]
                
                res.write(`data: ${JSON.stringify({ type: 'generating', speaker: speaker.nickname, role: 'reply' })}\n\n`)
                
                const memories = await loadMemberMemories(client, speaker.user_id)
                const historyMessages = await loadRecentMessages(client, chatroomId, 6)
                const replyText = await generateSpeakerReply({
                    speaker,
                    triggerSummary: openingText,
                    chatroom,
                    historyMessages,
                    memories
                })

                const inserted = await insertChatroomMessage(client, {
                    chatroomId,
                    userId: speaker.user_id,
                    content: replyText,
                    isAiAgent: true,
                    messageType: 'text',
                    relatedPostId: speaker.post_id,
                    lastSender: `${speaker.nickname}的分身`
                })

                res.write(`data: ${JSON.stringify({ 
                    type: 'message',
                    messageId: inserted.id,
                    userId: speaker.user_id,
                    nickname: speaker.nickname,
                    avatar: speaker.avatar,
                    content: replyText,
                    role: 'reply'
                })}\n\n`)

                remaining -= 1
            }

            // 发送完成事件
            res.write(`data: ${JSON.stringify({ type: 'done', totalMessages: maxMessages - remaining })}\n\n`)
            res.end()

        } catch (error) {
            console.error('❌ 流式生成失败:', error)
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`)
            res.end()
        } finally {
            client.release()
        }
    } catch (error) {
        console.error('❌ 流式生成失败:', error)
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: '流式生成失败' })
        }
    }
})

export default router
