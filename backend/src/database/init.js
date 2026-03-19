import { getPgPool, isPostgresEnabled } from './pg-client.js';

async function initPostgresDatabase() {
    const pool = getPgPool();
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL 连接成功');
    return pool;
}

export async function initDatabase() {
    try {
        if (!isPostgresEnabled()) {
            throw new Error('当前后端已切换为 PostgreSQL-only，请设置 DB_CLIENT=postgres');
        }

        return await initPostgresDatabase();
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
        throw error;
    }
}

export default { initDatabase };
