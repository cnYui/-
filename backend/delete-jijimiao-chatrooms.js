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

async function deleteChatrooms() {
    try {
        console.log('🔍 查找古鸡鸣寺附近的聊天室...\n');
        
        // 查找所有古鸡鸣寺附近的聊天室
        const result = await pool.query(`
            SELECT id, chatroom_name, city, location_name, member_count, created_at
            FROM chatrooms
            WHERE location_name LIKE '%鸡鸣寺%' OR chatroom_name LIKE '%鸡鸣寺%'
            ORDER BY created_at DESC
        `);
        
        console.log(`📊 找到 ${result.rows.length} 个聊天室\n`);
        
        if (result.rows.length === 0) {
            console.log('✅ 没有找到需要删除的聊天室');
            return;
        }
        
        // 显示聊天室信息
        result.rows.forEach((chatroom, index) => {
            console.log(`${index + 1}. ID: ${chatroom.id}`);
            console.log(`   名称: ${chatroom.chatroom_name}`);
            console.log(`   城市: ${chatroom.city}`);
            console.log(`   地点: ${chatroom.location_name}`);
            console.log(`   成员数: ${chatroom.member_count}`);
            console.log(`   创建时间: ${chatroom.created_at}`);
            console.log('');
        });
        
        // 删除所有找到的聊天室
        for (const chatroom of result.rows) {
            console.log(`🗑️  删除聊天室 ${chatroom.id}: ${chatroom.chatroom_name}`);
            
            // 删除聊天室消息
            const messagesResult = await pool.query(
                'DELETE FROM chatroom_messages WHERE chatroom_id = $1',
                [chatroom.id]
            );
            console.log(`   ✅ 删除了 ${messagesResult.rowCount} 条消息`);
            
            // 删除聊天室成员
            const membersResult = await pool.query(
                'DELETE FROM chatroom_members WHERE chatroom_id = $1',
                [chatroom.id]
            );
            console.log(`   ✅ 删除了 ${membersResult.rowCount} 个成员`);
            
            // 删除聊天室
            await pool.query(
                'DELETE FROM chatrooms WHERE id = $1',
                [chatroom.id]
            );
            console.log(`   ✅ 删除了聊天室\n`);
        }
        
        console.log('✅ 所有聊天室删除完成！');
        
    } catch (error) {
        console.error('❌ 删除失败:', error);
    } finally {
        await pool.end();
    }
}

deleteChatrooms();
