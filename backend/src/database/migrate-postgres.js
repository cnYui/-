import dotenv from 'dotenv';
import { getPgPool, closePgPool } from './pg-client.js';

dotenv.config();

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT,
    bio TEXT,
    footprint_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS travel_plans (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    destination TEXT NOT NULL,
    departure TEXT,
    travel_mode TEXT NOT NULL,
    estimated_days INTEGER NOT NULL,
    daily_plans JSONB NOT NULL,
    plan_status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS travel_progress (
    user_id BIGINT PRIMARY KEY REFERENCES users(id),
    plan_id BIGINT NOT NULL REFERENCES travel_plans(id),
    current_day INTEGER NOT NULL,
    step_index INTEGER NOT NULL,
    progress_status TEXT NOT NULL,
    location TEXT NOT NULL,
    remaining_seconds INTEGER DEFAULT 0,
    expected_complete_time TIMESTAMPTZ,
    last_update TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS user_memories (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS travel_diaries (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    plan_id BIGINT REFERENCES travel_plans(id),
    day INTEGER,
    destination TEXT NOT NULL,
    content TEXT NOT NULL,
    visited_places TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS mails (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    sender_type TEXT NOT NULL DEFAULT 'system',
    sender_id BIGINT,
    mail_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    extra_data JSONB,
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS conversation_sparks (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    other_user_id BIGINT REFERENCES users(id),
    city TEXT NOT NULL,
    conversation_data JSONB NOT NULL,
    spark_content TEXT NOT NULL,
    spark_reason TEXT,
    emotion_tag TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    plan_id BIGINT REFERENCES travel_plans(id),
    source_platform TEXT,
    source_note_id TEXT,
    title TEXT,
    content TEXT,
    image_url TEXT,
    image_count INTEGER DEFAULT 1,
    image_urls JSONB,
    mood TEXT,
    category TEXT,
    tags TEXT,
    city TEXT NOT NULL,
    district TEXT,
    location_name TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geo_confidence TEXT DEFAULT 'medium',
    is_public INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_platform, source_note_id)
  )`,

  `CREATE TABLE IF NOT EXISTS post_images (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    image_index INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    original_path TEXT,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, image_index)
  )`,

  `CREATE TABLE IF NOT EXISTS chatrooms (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    trigger_post_id BIGINT NOT NULL REFERENCES posts(id),
    chatroom_name TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    location_name TEXT,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    radius INTEGER DEFAULT 1000,
    member_count INTEGER DEFAULT 1,
    last_message TEXT,
    last_sender TEXT,
    last_active_at TIMESTAMPTZ,
    is_archived INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS chatroom_members (
    id BIGSERIAL PRIMARY KEY,
    chatroom_id BIGINT NOT NULL REFERENCES chatrooms(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    post_id BIGINT NOT NULL REFERENCES posts(id),
    last_read_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chatroom_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS chatroom_messages (
    id BIGSERIAL PRIMARY KEY,
    chatroom_id BIGINT NOT NULL REFERENCES chatrooms(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    is_ai_agent INTEGER DEFAULT 1,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    related_post_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS category TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS footprint_count INTEGER DEFAULT 0`,

  `CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_city ON posts(city)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_city_category ON posts(city, category)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(lat, lng)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_source ON posts(source_platform, source_note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_sparks_user_id ON conversation_sparks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_sparks_created_at ON conversation_sparks(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mails_user_id ON mails(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mails_created_at ON mails(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_chatrooms_user_id ON chatrooms(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chatrooms_last_active ON chatrooms(last_active_at)`,
  `CREATE INDEX IF NOT EXISTS idx_chatroom_members_chatroom ON chatroom_members(chatroom_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chatroom_messages_chatroom ON chatroom_messages(chatroom_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chatroom_messages_created ON chatroom_messages(created_at)`
];

async function runMigrations() {
  const pool = getPgPool();

  try {
    await pool.query('BEGIN');

    for (const sql of statements) {
      await pool.query(sql);
    }

    await pool.query('COMMIT');
    console.log(`✅ PostgreSQL migration 完成，共执行 ${statements.length} 条语句`);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ PostgreSQL migration 失败:', error.message);
    process.exitCode = 1;
  } finally {
    await closePgPool();
  }
}

runMigrations();
