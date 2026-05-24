
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'online';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20) DEFAULT '#4a7c4a';

ALTER TABLE channels ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'text';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Основное';

ALTER TABLE channel_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member';

CREATE TABLE IF NOT EXISTS message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL,
  message_type VARCHAR(10) DEFAULT 'dm',
  user_id INTEGER REFERENCES users(id),
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, message_type, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  last_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
