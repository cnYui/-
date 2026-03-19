import { Router } from 'express';
import { generateTravelImage } from '../services/stepfun.js';
import { getPgPool } from '../database/pg-client.js';
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js';

const router = Router();

function mapDiaryRow(row) {
    return {
        id: row.id,
        userId: row.user_id,
        planId: row.plan_id,
        day: row.day,
        destination: row.destination || null,
        content: row.content,
        imageUrl: row.image_url,
        createdAt: row.created_at
    };
}

// 获取用户的所有日记
router.get('/user/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        const pool = getPgPool();
        const result = await pool.query(
            `SELECT id, user_id, plan_id, day, destination, content, image_url, created_at
             FROM travel_diaries
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        res.json({ success: true, data: result.rows.map(mapDiaryRow) });
    } catch (error) {
        console.error('获取日记失败:', error);
        res.status(500).json({ success: false, error: '获取日记失败' });
    }
});

// 获取单个日记
router.get('/:diaryId', requireAuthenticatedUser, async (req, res) => {
    try {
        const { diaryId } = req.params;
        const userId = getAuthenticatedUserId(req);
        const pool = getPgPool();
        const result = await pool.query(
            `SELECT id, user_id, plan_id, day, destination, content, image_url, created_at
             FROM travel_diaries
             WHERE id = $1
             LIMIT 1`,
            [diaryId]
        );
        const diary = result.rows[0];
        
        if (!diary) {
            return res.status(404).json({ success: false, error: '日记不存在' });
        }

        if (String(diary.user_id) !== String(userId)) {
            return res.status(403).json({ success: false, error: '无权查看其他用户日记' });
        }
        
        res.json({ success: true, data: mapDiaryRow(diary) });
    } catch (error) {
        console.error('获取日记失败:', error);
        res.status(500).json({ success: false, error: '获取日记失败' });
    }
});

// 创建日记
router.post('/', requireAuthenticatedUser, async (req, res) => {
    try {
        const { planId, day, content, imageUrl } = req.body;
        const userId = getAuthenticatedUserId(req);
        
        if (!userId || !content) {
            return res.status(400).json({ success: false, error: '缺少必要参数' });
        }

        const pool = getPgPool();
        const result = await pool.query(
            `INSERT INTO travel_diaries (user_id, plan_id, day, content, image_url)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, user_id, plan_id, day, destination, content, image_url, created_at`,
            [userId, planId || null, day || null, content, imageUrl || null]
        );

        res.json({ success: true, data: mapDiaryRow(result.rows[0]) });
    } catch (error) {
        console.error('创建日记失败:', error);
        res.status(500).json({ success: false, error: '创建日记失败' });
    }
});

// 生成日记图片（AI）
router.post('/:diaryId/generate-image', requireAuthenticatedUser, async (req, res) => {
    try {
        const { diaryId } = req.params;
        const { content, destination, visitedPlaces } = req.body;
        
        console.log(`🎨 开始为日记 ${diaryId} 生成图片...`);
        console.log(`📍 目的地: ${destination}, 景点: ${visitedPlaces?.join('、')}`);
        
        // 调用 StepFun 生成图片
        const imageUrl = await generateTravelImage(
            content,
            destination,
            visitedPlaces || []
        );
        
        if (!imageUrl) {
            return res.status(500).json({ success: false, error: '图片生成失败' });
        }
        
        console.log(`✅ 日记 ${diaryId} 的图片已生成: ${imageUrl.substring(0, 50)}...`);
        
        res.json({ 
            success: true, 
            data: { 
                diaryId,
                imageUrl 
            } 
        });
    } catch (error) {
        console.error('生成日记图片失败:', error);
        res.status(500).json({ success: false, error: '生成日记图片失败: ' + error.message });
    }
});

// 更新日记图片
router.put('/:diaryId/image', requireAuthenticatedUser, async (req, res) => {
    try {
        const { diaryId } = req.params;
        const { imageUrl } = req.body;
        const userId = getAuthenticatedUserId(req);
        
        if (!imageUrl) {
            return res.status(400).json({ success: false, error: '缺少图片URL' });
        }

        const pool = getPgPool();
        const result = await pool.query(
            `UPDATE travel_diaries
             SET image_url = $1
             WHERE id = $2 AND user_id = $3
             RETURNING id, user_id, plan_id, day, destination, content, image_url, created_at`,
            [imageUrl, diaryId, userId]
        );
        const diary = result.rows[0];

        if (!diary) {
            return res.status(404).json({ success: false, error: '日记不存在或无权操作' });
        }

        res.json({ success: true, data: mapDiaryRow(diary) });
    } catch (error) {
        console.error('更新日记图片失败:', error);
        res.status(500).json({ success: false, error: '更新日记图片失败' });
    }
});

// 删除日记
router.delete('/:diaryId', requireAuthenticatedUser, async (req, res) => {
    try {
        const { diaryId } = req.params;
        const userId = getAuthenticatedUserId(req);
        const pool = getPgPool();
        const result = await pool.query(
            `DELETE FROM travel_diaries WHERE id = $1 AND user_id = $2`,
            [diaryId, userId]
        );
        
        res.json({ success: true, data: { changes: result.rowCount } });
    } catch (error) {
        console.error('删除日记失败:', error);
        res.status(500).json({ success: false, error: '删除日记失败' });
    }
});

export default router;
