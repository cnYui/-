-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    avatar TEXT,
    bio TEXT,
    footprint_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 旅行计划表
CREATE TABLE IF NOT EXISTS travel_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    destination TEXT NOT NULL,
    departure TEXT,
    travel_mode TEXT NOT NULL,
    estimated_days INTEGER NOT NULL,
    daily_plans TEXT NOT NULL,
    plan_status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 旅行进度表
CREATE TABLE IF NOT EXISTS travel_progress (
    user_id INTEGER PRIMARY KEY,
    plan_id INTEGER NOT NULL,
    current_day INTEGER NOT NULL,
    step_index INTEGER NOT NULL,
    progress_status TEXT NOT NULL,
    location TEXT NOT NULL,
    remaining_seconds INTEGER DEFAULT 0,
    expected_complete_time INTEGER,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES travel_plans(id)
);

-- 用户记忆表
CREATE TABLE IF NOT EXISTS user_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 旅行日记表
CREATE TABLE IF NOT EXISTS travel_diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER,
    day INTEGER,
    destination TEXT NOT NULL,
    content TEXT NOT NULL,
    visited_places TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES travel_plans(id)
);

-- 好友关系表
CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE(user_id, friend_id)
);

-- 对话火花表
CREATE TABLE IF NOT EXISTS conversation_sparks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    other_user_id INTEGER,
    city TEXT NOT NULL,
    conversation_data TEXT NOT NULL,
    spark_content TEXT NOT NULL,
    spark_reason TEXT,
    emotion_tag TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (other_user_id) REFERENCES users(id)
);

-- 贴文表
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER,
    content TEXT,
    image_url TEXT,
    mood TEXT,
    city TEXT NOT NULL,
    district TEXT,
    location_name TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    is_public INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES travel_plans(id)
);

-- 邮件表
CREATE TABLE IF NOT EXISTS mails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL DEFAULT 'system',
    sender_id INTEGER,
    mail_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    extra_data TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 聊天室表
CREATE TABLE IF NOT EXISTS chatrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    trigger_post_id INTEGER NOT NULL,
    chatroom_name TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    location_name TEXT,
    center_lat REAL NOT NULL,
    center_lng REAL NOT NULL,
    radius INTEGER DEFAULT 1000,
    member_count INTEGER DEFAULT 1,
    last_message TEXT,
    last_sender TEXT,
    last_active_at DATETIME,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (trigger_post_id) REFERENCES posts(id)
);

-- 聊天室成员表
CREATE TABLE IF NOT EXISTS chatroom_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatroom_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    last_read_at DATETIME,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    UNIQUE(chatroom_id, user_id)
);

-- 聊天消息表
CREATE TABLE IF NOT EXISTS chatroom_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatroom_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    is_ai_agent INTEGER DEFAULT 1,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    related_post_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_travel_plans_user_id ON travel_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_plans_status ON travel_plans(plan_status);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_category ON user_memories(category);
CREATE INDEX IF NOT EXISTS idx_travel_diaries_user_id ON travel_diaries(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_diaries_plan_id ON travel_diaries(plan_id);
CREATE INDEX IF NOT EXISTS idx_travel_diaries_created_at ON travel_diaries(created_at);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sparks_user_id ON conversation_sparks(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sparks_created_at ON conversation_sparks(created_at);

-- 新增索引
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_city ON posts(city);
CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(lat, lng);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_mails_user_id ON mails(user_id);
CREATE INDEX IF NOT EXISTS idx_mails_type ON mails(mail_type);
CREATE INDEX IF NOT EXISTS idx_mails_created_at ON mails(created_at);
CREATE INDEX IF NOT EXISTS idx_chatrooms_user_id ON chatrooms(user_id);
CREATE INDEX IF NOT EXISTS idx_chatrooms_last_active ON chatrooms(last_active_at);
CREATE INDEX IF NOT EXISTS idx_chatroom_members_chatroom ON chatroom_members(chatroom_id);
CREATE INDEX IF NOT EXISTS idx_chatroom_messages_chatroom ON chatroom_messages(chatroom_id);
CREATE INDEX IF NOT EXISTS idx_chatroom_messages_created ON chatroom_messages(created_at);
