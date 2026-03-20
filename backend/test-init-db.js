import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

import { initDatabase } from './src/database/init.js';

async function test() {
    try {
        console.log('🔄 开始初始化数据库...');
        await initDatabase();
        console.log('✅ 数据库初始化成功！');
        process.exit(0);
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        process.exit(1);
    }
}

test();
