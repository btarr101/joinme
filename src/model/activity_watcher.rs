use sqlx::{
    types::chrono::{DateTime, Utc},
    Executor, Postgres,
};

use super::{activity_message::ActivityMessage, DiscordId, Id};

#[derive(sqlx::FromRow, serde::Serialize, Debug)]
pub struct ActivityWatcher {
    pub id: Id,
    pub guild_id: DiscordId,
    pub user_id: DiscordId,
    pub activity_name: String,
    pub channel_id: DiscordId,
    pub last_triggered: Option<DateTime<Utc>>,
}

impl ActivityWatcher {
    pub async fn get_or_create<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        guild_id: DiscordId,
        user_id: DiscordId,
        activity_name: &'a str,
        channel_id: DiscordId,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as_unchecked!(
            ActivityWatcher,
            "
            WITH inserted AS (
                INSERT INTO activity_watcher (guild_id, user_id, activity_name, channel_id, last_triggered)
                VALUES ($1, $2, $3, $4, NULL)
                ON CONFLICT DO NOTHING
                RETURNING *
            )
            SELECT * FROM inserted
            UNION ALL
            SELECT * FROM activity_watcher
            WHERE guild_id=$1 AND user_id=$2 AND activity_name=$3 AND channel_id=$4
            LIMIT 1
            ",
            guild_id,
            user_id,
            activity_name,
            channel_id
        )
        .fetch_one(executor)
        .await
    }

    pub async fn get<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        id: Id,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityWatcher,
            "SELECT * FROM activity_watcher WHERE id = $1",
            id
        )
        .fetch_optional(executor)
        .await
    }

    pub async fn query<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        guild_id: DiscordId,
        user_id: DiscordId,
        activity_name: &'a str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityWatcher,
            "SELECT * FROM activity_watcher WHERE guild_id = $1 AND user_id = $2 AND activity_name = $3",
            guild_id,
            user_id,
            activity_name,
        )
        .fetch_all(executor)
        .await
    }

    pub async fn query_by_channel<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        guild_id: DiscordId,
        user_id: DiscordId,
        channel_id: DiscordId,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ActivityWatcher,
            "SELECT * FROM activity_watcher WHERE guild_id = $1 AND user_id = $2 AND channel_id = $3",
            guild_id,
            user_id,
            channel_id,
        )
        .fetch_all(executor)
        .await
    }

    pub async fn query_random_message<'a, E: Executor<'a, Database = Postgres>>(
        &self,
        executor: E,
    ) -> Result<Option<ActivityMessage>, sqlx::Error> {
        ActivityMessage::query_random(executor, self.id).await
    }

    pub async fn delete_messages<'a, E: Executor<'a, Database = Postgres>>(
        &self,
        executor: E,
    ) -> Result<Vec<ActivityMessage>, sqlx::Error> {
        ActivityMessage::delete_all_associated_with(executor, self.id).await
    }

    pub async fn update_last_triggered<'a, E: Executor<'a, Database = Postgres>>(
        &mut self,
        executor: E,
    ) -> Result<DateTime<Utc>, sqlx::Error> {
        let new_last_triggered = sqlx::query_scalar!(
            "
            UPDATE activity_watcher
            SET last_triggered = NOW()
            WHERE id = $1 AND (last_triggered IS NULL OR last_triggered < NOW())
            RETURNING last_triggered::TIMESTAMPTZ",
            self.id
        )
        .fetch_one(executor)
        .await
        .map(|optional| optional.expect("timestamp"))?;

        self.last_triggered.replace(new_last_triggered);

        Ok(new_last_triggered)
    }

    pub async fn delete<'a, E: Executor<'a, Database = Postgres>>(
        self,
        executor: E,
    ) -> Result<(), sqlx::Error> {
        sqlx::query_as!(
            ActivityWatcher,
            "DELETE FROM activity_watcher WHERE id = $1 RETURNING activity_watcher.*",
            self.id
        )
        .fetch_one(executor)
        .await
        .map(|_| ())
    }
}
