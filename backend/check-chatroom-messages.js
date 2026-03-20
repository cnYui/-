import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'mingri_lvtu',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
});

async function checkChatroomMessages() {
    try {
        console.log('🔍 查询聊天室 10 的消息...\n');
        
        const result = await pool.query(`
            SELECT 
                cm.id,
                cm.user_id,
                u.nickname,
                cm.is_ai_agent,
                cm.content,
                cm.message_type,
                cm.created_at
            FROM chatroom_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.chatroom_id = 10
            ORDER BY cm.created_at DESC, cm.id DESC
            LIMIT 20
        `);
        
        console.log(`📊 共找到 ${result.rows.length} 条消息\n`);
        
        result.rows.forEach((msg, index) => {
            const isAI = msg.is_ai_agent === 1 || msg.is_ai_agent === true;
            const icon = isAI ? '🤖' : '👤';
            const type = msg.message_type === 'system' ? '[系统]' : '';
            
            console.log(`${icon} ${index + 1}. ${msg.nickname} ${type}`);
            console.log(`   ID: ${msg.id}, 用户ID: ${msg.user_id}`);
            console.log(`   内容: ${msg.content.substring(0, 60)}${msg.content.length > 60 ? '...' : ''}`);
            console.log(`   时间: ${msg.created_at}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ 查询失败:', error);
    } finally {
        await pool.end();
    }
}

checkChatroomMessages();
