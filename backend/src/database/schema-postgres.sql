-- PostgreSQL 数据库表结构
-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    nickname VARCHAR(255) NOT NULL,
    avatar TEXT,
    bio TEXT,
    footprint_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 旅行计划表
CREATE TABLE IF NOT EXISTS travel_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    destination TEXT NOT NULL,
    departure TEXT,
    travel_mode TEXT NOT NULL,
    estimated_days INTEGER NOT NULL,
    daily_plans TEXT NOT NULL,
    plan_status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    expected_complete_time BIGINT,
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES travel_plans(id) ON DELETE CASCADE
);

-- 用户记忆表
CREATE TABLE IF NOT EXISTS user_memories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    category VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 旅行日记表
CREATE TABLE IF NOT EXISTS travel_diaries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    plan_id INTEGER,
    day INTEGER,
    destination TEXT NOT NULL,
    content TEXT NOT NULL,
    visited_places TEXT,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES travel_plans(id) ON DELETE SET NULL
);

-- 好友关系表
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, friend_id)
);

-- 对话火花表
CREATE TABLE IF NOT EXISTS conversation_sparks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    other_user_id INTEGER,
    city TEXT NOT NULL,
    conversation_data TEXT NOT NULL,
    spark_content TEXT NOT NULL,
    spark_reason TEXT,
    emotion_tag VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (other_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 贴文表
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    plan_id INTEGER,
    title TEXT,
    content TEXT,
    image_url TEXT,
    mood VARCHAR(50),
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    location_name VARCHAR(255),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    visit_time TIMESTAMP,
    is_public INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES travel_plans(id) ON DELETE SET NULL
);

-- 邮件表
CREATE TABLE IF NOT EXISTS mails (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    sender_type VARCHAR(50) NOT NULL DEFAULT 'system',
    sender_id INTEGER,
    mail_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    extra_data TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 聊天室表
CREATE TABLE IF NOT EXISTS chatrooms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    trigger_post_id INTEGER NOT NULL,
    chatroom_name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    location_name VARCHAR(255),
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    radius INTEGER DEFAULT 1000,
    member_count INTEGER DEFAULT 1,
    last_message TEXT,
    last_sender VARCHAR(255),
    last_active_at TIMESTAMP,
    is_archived INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (trigger_post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- 聊天室成员表
CREATE TABLE IF NOT EXISTS chatroom_members (
    id SERIAL PRIMARY KEY,
    chatroom_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    last_read_at TIMESTAMP,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE(chatroom_id, user_id)
);

-- 聊天消息表
CREATE TABLE IF NOT EXISTS chatroom_messages (
    id SERIAL PRIMARY KEY,
    chatroom_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    is_ai_agent INTEGER DEFAULT 1,
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    related_post_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 保存记录表
CREATE TABLE IF NOT EXISTS saved_post_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_mode VARCHAR(50) DEFAULT 'image',
    original_image_url TEXT,
    generated_image_url TEXT,
    movie_name VARCHAR(255),
    mood VARCHAR(50),
    city VARCHAR(100),
    district VARCHAR(100),
    location_name VARCHAR(255),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    visit_time TIMESTAMP,
    status VARCHAR(50) DEFAULT 'draft',
    published_post_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (published_post_id) REFERENCES posts(id) ON DELETE SET NULL
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
CREATE INDEX IF NOT EXISTS idx_saved_records_user_id ON saved_post_records(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_records_status ON saved_post_records(status);

-- 插入默认测试用户
INSERT INTO users (id, username, nickname, avatar, bio) 
VALUES (53, 'test', 'test', NULL, '测试用户')
ON CONFLICT (id) DO NOTHING;

-- 重置序列（确保下一个ID从54开始）
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
