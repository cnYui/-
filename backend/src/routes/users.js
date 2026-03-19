import { Router } from 'express';
import { getPgPool } from '../database/pg-client.js';
import { ensureSameUserParam, getAuthenticatedUserId, requireAuthenticatedUser } from '../middleware/auth-session.js';

const router = Router();

function mapUser(user, isNewUser = false) {
    return {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        bio: user.bio,
        footprintCount: Number(user.footprint_count || 0),
        isNewUser
    };
}

// 创建用户（登录）
router.post('/', async (req, res) => {
    try {
        const { username, nickname } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, error: '用户名不能为空' });
        }

        const pool = getPgPool();
        const existingUser = await pool.query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);

        if (existingUser.rows.length > 0) {
            console.log('✅ 老用户登录:', existingUser.rows[0].username);
            return res.json({ success: true, data: mapUser(existingUser.rows[0], false) });
        }

        const inserted = await pool.query(
            `INSERT INTO users (username, nickname, avatar, bio, footprint_count)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                username,
                nickname || username,
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                '热爱旅行，记录生活',
                0
            ]
        );

        console.log('✅ 新用户注册:', inserted.rows[0].username);
        return res.json({ success: true, data: mapUser(inserted.rows[0], true) });
    } catch (error) {
        console.error('创建用户失败:', error);
        res.status(500).json({ success: false, error: '创建用户失败' });
    }
});

// 获取用户信息
router.get('/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        const pool = getPgPool();
        const result = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(404).json({ success: false, error: '用户不存在' });
        }
        
        return res.json({ success: true, data: mapUser(user, false) });
    } catch (error) {
        console.error('获取用户失败:', error);
        res.status(500).json({ success: false, error: '获取用户失败' });
    }
});

// 检查昵称是否可用
router.get('/nickname-availability/check', requireAuthenticatedUser, async (req, res) => {
    try {
        const nickname = String(req.query.nickname || '').trim();
        const excludeUserId = getAuthenticatedUserId(req);

        if (!nickname) {
            return res.status(400).json({ success: false, error: '昵称不能为空' });
        }

        const pool = getPgPool();
        const values = [nickname];
        let sql = 'SELECT id FROM users WHERE nickname = $1';

        if (excludeUserId) {
            values.push(excludeUserId);
            sql += ' AND id <> $2';
        }

        sql += ' LIMIT 1';
        const result = await pool.query(sql, values);

        return res.json({
            success: true,
            data: { available: result.rows.length === 0 }
        });
    } catch (error) {
        console.error('检查昵称失败:', error);
        res.status(500).json({ success: false, error: '检查昵称失败' });
    }
});

// 更新用户信息
router.put('/:userId', requireAuthenticatedUser, ensureSameUserParam('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { nickname, avatar, bio } = req.body;
        const normalizedNickname = nickname === undefined ? undefined : String(nickname).trim();

        if (nickname !== undefined && !normalizedNickname) {
            return res.status(400).json({ success: false, error: '昵称不能为空' });
        }

        const pool = getPgPool();

        if (normalizedNickname !== undefined) {
            const existsResult = await pool.query(
                'SELECT id FROM users WHERE nickname = $1 AND id <> $2 LIMIT 1',
                [normalizedNickname, userId]
            );

            if (existsResult.rows.length > 0) {
                return res.status(409).json({ success: false, error: '昵称已存在，请更换其他昵称' });
            }
        }

        const updates = [];
        const values = [];
        
        if (normalizedNickname !== undefined) {
            updates.push(`nickname = $${values.length + 1}`);
            values.push(normalizedNickname);
        }
        if (avatar !== undefined) {
            updates.push(`avatar = $${values.length + 1}`);
            values.push(avatar);
        }
        if (bio !== undefined) {
            updates.push(`bio = $${values.length + 1}`);
            values.push(bio);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: '没有要更新的字段' });
        }
        
        values.push(userId);
        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
            values
        );
        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({ success: false, error: '用户不存在' });
        }

        return res.json({ success: true, data: mapUser(user, false) });
    } catch (error) {
        console.error('更新用户失败:', error);
        res.status(500).json({ success: false, error: '更新用户失败' });
    }
});

export default router;
