use poise::serenity_prelude::{ChannelId, GuildId, UserId};
use sqlx::{
    types::chrono::{DateTime, Utc},
    PgPool,
};

use crate::model::{activity_message::ActivityMessage, activity_watcher::ActivityWatcher, Id};

pub struct State {
    pub pool: PgPool,
}

impl State {
    /// Adds a message that will be triggered.
    pub async fn add_message(
        &self,
        user_id: UserId,
        guild_id: GuildId,
        channel_id: ChannelId,
        activity_name: &str,
        message: &str,
    ) -> anyhow::Result<ActivityMessage> {
        let mut transaction = self.pool.begin().await?;

        let activity_watcher = ActivityWatcher::get_or_create(
            &mut *transaction,
            guild_id.into(),
            user_id.into(),
            activity_name,
            channel_id.into(),
        )
        .await?;

        let activity_message =
            ActivityMessage::create(&mut *transaction, activity_watcher.id, message).await?;

        transaction.commit().await?;

        Ok(activity_message)
    }

    pub async fn remove_messages(
        &self,
        user_id: UserId,
        guild_id: GuildId,
        channel_id: ChannelId,
        activity_name: Option<&str>,
    ) -> anyhow::Result<Vec<ActivityMessage>> {
        let mut activity_watchers = ActivityWatcher::query_by_channel(
            &self.pool,
            guild_id.into(),
            user_id.into(),
            channel_id.into(),
        )
        .await?;

        if let Some(activity_name) = activity_name {
            activity_watchers.retain(|watcher| watcher.activity_name == activity_name);
        }

        let mut transaction = self.pool.begin().await?;

        let mut removed_messages = Vec::new();
        for activity_watcher in activity_watchers {
            removed_messages
                .append(&mut activity_watcher.delete_messages(&mut *transaction).await?);

            activity_watcher.delete(&mut *transaction).await?;
        }

        transaction.commit().await?;

        Ok(removed_messages)
    }

    pub async fn remove_message(
        &self,
        user_id: UserId,
        guild_id: GuildId,
        channel_id: ChannelId,
        message_id: Id,
    ) -> anyhow::Result<bool> {
        ActivityMessage::delete_by_id_if_allowed(
            &self.pool,
            message_id,
            user_id.into(),
            guild_id.into(),
            channel_id.into(),
        )
        .await
        .map(|row| row.is_some())
        .map_err(anyhow::Error::new)
    }

    pub async fn get_watchers_and_messages(
        &self,
        user_id: UserId,
        guild_id: GuildId,
        channel_id: ChannelId,
    ) -> anyhow::Result<(Vec<ActivityWatcher>, Vec<ActivityMessage>)> {
        let activity_watchers = ActivityWatcher::query_by_channel(
            &self.pool,
            guild_id.into(),
            user_id.into(),
            channel_id.into(),
        )
        .await?;

        let activity_messages = ActivityMessage::query(
            &self.pool,
            guild_id.into(),
            user_id.into(),
            channel_id.into(),
        )
        .await?;

        Ok((activity_watchers, activity_messages))
    }

    /// Gets all activity watchers.
    pub async fn get_watchers(
        &self,
        user_id: UserId,
        guild_id: GuildId,
        activity_name: &str,
    ) -> anyhow::Result<Vec<ActivityWatcher>> {
        ActivityWatcher::query(&self.pool, guild_id.into(), user_id.into(), activity_name)
            .await
            .map_err(anyhow::Error::new)
    }

    /// Gets a random message to send for the watcher
    pub async fn get_random_message_for_watcher(
        &self,
        activity_watcher: &ActivityWatcher,
    ) -> anyhow::Result<Option<ActivityMessage>> {
        activity_watcher
            .query_random_message(&self.pool)
            .await
            .map_err(anyhow::Error::new)
    }

    /// Signals the watcher was triggered
    pub async fn update_last_triggered_for_watcher(
        &self,
        activity_watcher: &mut ActivityWatcher,
    ) -> anyhow::Result<DateTime<Utc>> {
        activity_watcher
            .update_last_triggered(&self.pool)
            .await
            .map_err(anyhow::Error::new)
    }
}
