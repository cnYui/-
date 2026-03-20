import { getPgPool, isPostgresEnabled } from './pg-client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initPostgresDatabase() {
    const pool = getPgPool();
    
    // 测试连接
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL 连接成功');
    
    // 读取并执行 schema SQL
    const schemaPath = path.join(__dirname, 'schema-postgres.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📝 开始创建数据库表结构...');
    
    try {
        // 直接执行整个SQL文件（PostgreSQL支持）
        await pool.query(schemaSql);
        console.log('✅ 数据库表结构创建完成');
    } catch (error) {
        // 如果整体执行失败，尝试逐条执行
        console.log('⚠️  整体执行失败，尝试逐条执行...');
        
        const statements = schemaSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        for (const statement of statements) {
            try {
                await pool.query(statement);
            } catch (err) {
                // 忽略已存在的错误
                if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
                    console.error('❌ 执行SQL失败:', statement.substring(0, 100));
                    console.error('   错误:', err.message);
                }
            }
        }
        console.log('✅ 数据库表结构创建完成（部分语句可能已跳过）');
    }
    
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
