CREATE TABLE activity_watcher (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    activity_name VARCHAR(64) NOT NULL,
    channel_id BIGINT NOT NULL,
    last_triggered TIMESTAMPTZ DEFAULT NULL,
    UNIQUE (guild_id, user_id, activity_name, channel_id)
);

CREATE TABLE activity_message (
    id SERIAL PRIMARY KEY,
    activity_watcher INTEGER NOT NULL REFERENCES activity_watcher(id) ON DELETE CASCADE,
    message TEXT NOT NULL
);