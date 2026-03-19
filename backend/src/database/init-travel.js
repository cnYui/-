// 旅行功能数据库初始化

function initTravelTables(db) {
    console.log('📊 初始化旅行功能数据库表...');

    // 旅行计划表
    db.exec(`
        CREATE TABLE IF NOT EXISTS travel_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            destination TEXT NOT NULL,
            departure TEXT,
            travel_mode TEXT DEFAULT 'same_city',
            estimated_days INTEGER DEFAULT 3,
            daily_plans TEXT,
            plan_status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 旅行进度表
    db.exec(`
        CREATE TABLE IF NOT EXISTS travel_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            plan_id INTEGER NOT NULL,
            current_day INTEGER DEFAULT 1,
            step_index INTEGER DEFAULT 0,
            progress_status TEXT DEFAULT 'traveling',
            location TEXT,
            remaining_seconds INTEGER DEFAULT 0,
            expected_complete_time DATETIME,
            last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (plan_id) REFERENCES travel_plans(id)
        )
    `);

    // 旅行日记表
    db.exec(`
        CREATE TABLE IF NOT EXISTS travel_diaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            day INTEGER NOT NULL,
            content TEXT,
            images TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plan_id) REFERENCES travel_plans(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    console.log('✅ 旅行功能数据库表初始化完成');
}

module.exports = { initTravelTables };
