import { Router } from 'express';
import { callDeepSeek } from '../services/deepseek.js';
import { getPgPool } from '../database/pg-client.js';
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js';

const router = Router();

function mapMemoryRow(row) {
    return {
        id: row.id,
        userId: row.user_id ?? row.userId,
        category: row.category,
        title: row.title,
        content: row.content,
        createTime: row.created_at ?? row.createTime
    };
}

// 获取用户的所有记忆
router.get('/user/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        const pool = getPgPool();
        const result = await pool.query(
            `SELECT id, user_id, category, title, content, created_at
             FROM user_memories
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        return res.json({ success: true, data: result.rows.map(mapMemoryRow) });
    } catch (error) {
        console.error('获取记忆失败:', error);
        res.status(500).json({ success: false, error: '获取记忆失败' });
    }
});

// 创建单个记忆
router.post('/', requireAuthenticatedUser, async (req, res) => {
    try {
        const { category, title, content } = req.body;
        const userId = getAuthenticatedUserId(req);
        
        if (!userId || !content) {
            return res.status(400).json({ success: false, error: '缺少必要参数' });
        }

        const pool = getPgPool();
        const result = await pool.query(
            `INSERT INTO user_memories (user_id, category, title, content)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id, category, title, content, created_at`,
            [userId, category || '个人记忆', title || '未分类', content]
        );

        return res.json({ success: true, data: mapMemoryRow(result.rows[0]) });
    } catch (error) {
        console.error('创建记忆失败:', error);
        res.status(500).json({ success: false, error: '创建记忆失败' });
    }
});

// 批量创建记忆
router.post('/batch', requireAuthenticatedUser, async (req, res) => {
    try {
        const { memories } = req.body;
        const userId = getAuthenticatedUserId(req);
        
        if (!userId || !memories || !Array.isArray(memories)) {
            return res.status(400).json({ success: false, error: '缺少必要参数' });
        }

        const pool = getPgPool();
        const inserted = [];

        for (const item of memories) {
            const result = await pool.query(
                `INSERT INTO user_memories (user_id, category, title, content)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, user_id, category, title, content, created_at`,
                [
                    userId,
                    item.category || '个人记忆',
                    item.title || '未分类',
                    item.content
                ]
            );
            inserted.push(mapMemoryRow(result.rows[0]));
        }

        return res.json({ success: true, data: inserted });
    } catch (error) {
        console.error('批量创建记忆失败:', error);
        res.status(500).json({ success: false, error: '批量创建记忆失败' });
    }
});

// 追加内容到现有记忆
router.put('/:memoryId/append', requireAuthenticatedUser, async (req, res) => {
    try {
        const { memoryId } = req.params;
        const { content } = req.body;
        const userId = getAuthenticatedUserId(req);
        
        if (!content) {
            return res.status(400).json({ success: false, error: '缺少内容' });
        }

        const pool = getPgPool();
        const existingResult = await pool.query(
            'SELECT id, user_id, content FROM user_memories WHERE id = $1 LIMIT 1',
            [memoryId]
        );
        const existing = existingResult.rows[0];

        if (!existing) {
            return res.status(404).json({ success: false, error: '记忆不存在' });
        }

        if (String(existing.user_id) !== String(userId)) {
            return res.status(403).json({ success: false, error: '无权修改其他用户记忆' });
        }

        const newContent = `${existing.content}\n${content}`;
        const updateResult = await pool.query(
            `UPDATE user_memories
             SET content = $1
             WHERE id = $2
             RETURNING id, user_id, category, title, content, created_at`,
            [newContent, memoryId]
        );

        return res.json({ success: true, data: mapMemoryRow(updateResult.rows[0]) });
    } catch (error) {
        console.error('追加记忆失败:', error);
        res.status(500).json({ success: false, error: '追加记忆失败' });
    }
});

// 删除记忆
router.delete('/:memoryId', requireAuthenticatedUser, async (req, res) => {
    try {
        const { memoryId } = req.params;
        const userId = getAuthenticatedUserId(req);
        const pool = getPgPool();
        const result = await pool.query('DELETE FROM user_memories WHERE id = $1 AND user_id = $2', [memoryId, userId]);
        return res.json({ success: true, data: { changes: result.rowCount } });
    } catch (error) {
        console.error('删除记忆失败:', error);
        res.status(500).json({ success: false, error: '删除记忆失败' });
    }
});

// AI 分类记忆内容
router.post('/classify', requireAuthenticatedUser, async (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, error: '缺少内容' });
        }

        console.log('🤖 开始 AI 分类记忆...');
        
        const prompt = `请分析以下用户输入的记忆内容，将其拆分成多个独立的分类。

**重要规则：**
1. 必须将内容拆分成多个独立的分类对象，每个对象只包含一个主题
2. 不要把所有内容合并在一起
3. 每个分类的 content 字段只包含该分类相关的具体内容
4. 不要使用 Markdown 格式，直接用纯文本

记忆内容：
${content}

常见分类：个人信息、学业经历、工作经验、技术能力、参赛经历、兴趣爱好、性格特点、职业目标

输出格式（JSON 数组）：
[
  {"category":"个人信息","title":"基本信息","content":"出生年份：2003年，家乡：南京"},
  {"category":"学业经历","title":"留学计划","content":"2026年3月24日前往日本福井大学攻读研究生"},
  {"category":"技术能力","title":"语言能力","content":"日语N2，托福85分"}
]

请直接输出JSON数组：`;

        const systemPrompt = '你是记忆分类助手。只输出JSON数组，不要其他内容。';
        
        const result = await callDeepSeek(systemPrompt, prompt, {
            temperature: 0.3,
            max_tokens: 2000
        });
        
        // 清理 JSON
        let jsonStr = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        
        if (!jsonMatch) {
            console.error('❌ 未找到 JSON 数组');
            return res.json({ 
                success: true, 
                data: [{ category: '个人记忆', title: '未分类记忆', content }] 
            });
        }

        const items = JSON.parse(jsonMatch[0]);
        
        if (!Array.isArray(items) || items.length === 0) {
            return res.json({ 
                success: true, 
                data: [{ category: '个人记忆', title: '未分类记忆', content }] 
            });
        }

        const validItems = items
            .filter(item => item.category && item.title && item.content)
            .map(item => ({
                category: String(item.category).substring(0, 30),
                title: String(item.title).substring(0, 50),
                content: String(item.content).trim(),
            }));
        
        console.log('✅ AI 分类完成，数量:', validItems.length);
        
        res.json({ 
            success: true, 
            data: validItems.length > 0 ? validItems : [{ category: '个人记忆', title: '未分类记忆', content }] 
        });
        
    } catch (error) {
        console.error('AI 分类失败:', error);
        res.status(500).json({ success: false, error: 'AI 分类失败: ' + error.message });
    }
});

export default router;
