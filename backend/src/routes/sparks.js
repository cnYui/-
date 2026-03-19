import { Router } from 'express';
import { getPgPool } from '../database/pg-client.js';
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js';

const router = Router();

function mapSparkRow(row) {
    return {
        id: row.id,
        userId: row.user_id ?? row.userId,
        otherUserId: row.other_user_id ?? row.otherUserId,
        city: row.city,
        conversationData: row.conversation_data ?? row.conversationData,
        sparkContent: row.spark_content ?? row.sparkContent,
        sparkReason: row.spark_reason ?? row.sparkReason,
        emotionTag: row.emotion_tag ?? row.emotionTag,
        createdAt: row.created_at ?? row.createdAt,
        otherUserName: row.otherUserName
    };
}

// 获取用户的火花列表
router.get('/user/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        const pool = getPgPool();
        const result = await pool.query(
            `SELECT 
                cs.id,
                cs.user_id,
                cs.other_user_id,
                cs.city,
                cs.conversation_data,
                cs.spark_content,
                cs.spark_reason,
                cs.emotion_tag,
                cs.created_at,
                u.nickname AS "otherUserName"
             FROM conversation_sparks cs
             LEFT JOIN users u ON cs.other_user_id = u.id
             WHERE cs.user_id = $1
             ORDER BY cs.created_at DESC`,
            [userId]
        );

        return res.json({ success: true, data: result.rows.map(mapSparkRow) });
    } catch (error) {
        console.error('获取火花列表失败:', error);
        res.status(500).json({ success: false, error: '获取火花列表失败: ' + error.message });
    }
});

// 保存火花
router.post('/', requireAuthenticatedUser, async (req, res) => {
    try {
        const { otherUserId, city, conversationData, sparkContent, sparkReason, emotionTag } = req.body;
        const userId = getAuthenticatedUserId(req);
        
        if (!userId || !city || !conversationData || !sparkContent) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少必要参数: userId, city, conversationData, sparkContent' 
            });
        }

        const pool = getPgPool();
        const result = await pool.query(
            `INSERT INTO conversation_sparks 
             (user_id, other_user_id, city, conversation_data, spark_content, spark_reason, emotion_tag)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
             RETURNING id, user_id, other_user_id, city, conversation_data, spark_content, spark_reason, emotion_tag, created_at`,
            [
                userId,
                otherUserId || null,
                city,
                JSON.stringify(conversationData),
                sparkContent,
                sparkReason || null,
                emotionTag || '共鸣'
            ]
        );

        return res.json({ success: true, data: mapSparkRow(result.rows[0]) });
    } catch (error) {
        console.error('保存火花失败:', error);
        res.status(500).json({ success: false, error: '保存火花失败: ' + error.message });
    }
});

// 获取火花详情
router.get('/:sparkId', requireAuthenticatedUser, async (req, res) => {
    try {
        const { sparkId } = req.params;
        const userId = getAuthenticatedUserId(req);

        const pool = getPgPool();
        const result = await pool.query(
            `SELECT 
                cs.id,
                cs.user_id,
                cs.other_user_id,
                cs.city,
                cs.conversation_data,
                cs.spark_content,
                cs.spark_reason,
                cs.emotion_tag,
                cs.created_at,
                u.nickname AS "otherUserName"
             FROM conversation_sparks cs
             LEFT JOIN users u ON cs.other_user_id = u.id
             WHERE cs.id = $1
             LIMIT 1`,
            [sparkId]
        );
        const spark = result.rows[0];
        
        if (!spark) {
            return res.status(404).json({ success: false, error: '火花不存在' });
        }

        if (String(spark.user_id) !== String(userId)) {
            return res.status(403).json({ success: false, error: '无权访问其他用户火花' });
        }
        
        return res.json({ success: true, data: mapSparkRow(spark) });
    } catch (error) {
        console.error('获取火花详情失败:', error);
        res.status(500).json({ success: false, error: '获取火花详情失败: ' + error.message });
    }
});

export default router;
