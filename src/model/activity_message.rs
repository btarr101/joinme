use sqlx::{Executor, Postgres};

use super::{DiscordId, Id};

/// Table to query for getting the messages to send.
#[derive(sqlx::FromRow, Debug)]
pub struct ActivityMessage {
    pub id: Id,
    pub activity_watcher: Id,
    pub message: String,
}

impl ActivityMessage {
    /// Creates a new message associated with a particular watcher.
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

    /// Gets a message if allowed via the perspective of a user accessing it
    /// from a particular channel.
    pub async fn get_if_allowed<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        id: Id,
        user_id: DiscordId,
        channel_id: DiscordId,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityMessage,
            "
            SELECT am.*
            FROM activity_message am
            JOIN activity_watcher aw ON am.activity_watcher = aw.id
            WHERE am.id = $1
                AND aw.user_id = $2
                AND aw.channel_id = $3
            ",
            id,
            user_id,
            channel_id
        )
        .fetch_optional(executor)
        .await
    }

    /// Queries a random message by a particular watcher.
    pub async fn query_randomly_by_activity_watcher<'a, E: Executor<'a, Database = Postgres>>(
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

    /// Query for a message by the user and channel.
    pub async fn query_by_user_channel<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        user_id: DiscordId,
        channel_id: DiscordId,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityMessage,
            "
            SELECT am.*
            FROM activity_message am
            JOIN activity_watcher aw ON am.activity_watcher = aw.id
            WHERE aw.user_id = $1 AND aw.channel_id = $2
            ",
            user_id,
            channel_id
        )
        .fetch_all(executor)
        .await
    }

    /// Delete all messages associated with a particular activity watcher.
    pub async fn delete_all_by_activity_watcher<'a, E: Executor<'a, Database = Postgres>>(
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

    /// Delete a message by a particular id, but only if allowed.
    pub async fn delete_by_id_if_allowed<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        id: Id,
        user_id: DiscordId,
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
                AND activity_watcher.channel_id = $3
            RETURNING activity_message.*
            ",
            id,
            user_id,
            channel_id
        )
        .fetch_optional(executor)
        .await
    }
}
