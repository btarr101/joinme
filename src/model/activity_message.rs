use sqlx::{Executor, Postgres};

use super::{DiscordId, Id};

#[derive(sqlx::FromRow, serde::Serialize, Debug)]
pub struct ActivityMessage {
    pub id: Id,
    pub activity_watcher: Id,
    pub message: String,
}
impl ActivityMessage {
    pub async fn create<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        activity_watcher_id: Id,
        message: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            ActivityMessage,
            "INSERT INTO activity_message (activity_watcher, message) VALUES ($1, $2) RETURNING *",
            activity_watcher_id,
            message
        )
        .fetch_one(executor)
        .await
    }

    pub async fn query_random<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        activity_watcher_id: Id,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityMessage,
            "SELECT * FROM activity_message WHERE activity_watcher = $1 ORDER BY RANDOM() LIMIT 1",
            activity_watcher_id
        )
        .fetch_optional(executor)
        .await
    }

    pub async fn query<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        guild_id: DiscordId,
        user_id: DiscordId,
        channel_id: DiscordId,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityMessage,
            "
            SELECT am.*
            FROM activity_message am
            JOIN activity_watcher aw ON am.activity_watcher = aw.id
            WHERE aw.guild_id = $1 AND aw.user_id = $2 AND aw.channel_id = $3
            ",
            guild_id,
            user_id,
            channel_id
        )
        .fetch_all(executor)
        .await
    }

    pub async fn delete_all_associated_with<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        activity_watcher_id: Id,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityMessage,
            "DELETE FROM activity_message WHERE activity_watcher = $1 RETURNING activity_message.*",
            activity_watcher_id
        )
        .fetch_all(executor)
        .await
    }

    pub async fn delete_by_id_if_allowed<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        id: Id,
        user_id: DiscordId,
        guild_id: DiscordId,
        channel_id: DiscordId,
    ) -> Result<Option<ActivityMessage>, sqlx::Error> {
        sqlx::query_as!(
            ActivityMessage,
            "
            DELETE
            FROM activity_message
            USING activity_watcher
            WHERE activity_message.id = $1
            AND activity_watcher.user_id = $2
            AND activity_watcher.guild_id = $3
            AND activity_watcher.channel_id = $4
            RETURNING activity_message.*
            ",
            id,
            user_id,
            guild_id,
            channel_id
        )
        .fetch_optional(executor)
        .await
    }
}
