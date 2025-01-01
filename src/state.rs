use poise::serenity_prelude::{Activity, GuildChannel, GuildId, UserId};
use sqlx::{
    types::chrono::{DateTime, Utc},
    PgPool,
};

use crate::model::{
    activity_message::ActivityMessage, activity_watcher::ActivityWatcher,
    recorded_activity::RecordedActivity, Id,
};

pub struct State {
    pub pool: PgPool,
}

impl State {
    /// Adds a message that will be triggered by a user
    /// starting an activity.
    pub async fn add_triggered_message(
        &self,
        guild_channel: GuildChannel,
        user_id: UserId,
        activity_name: &str,
        message: &str,
    ) -> anyhow::Result<ActivityMessage> {
        let mut transaction = self.pool.begin().await?;

        let activity_watcher = ActivityWatcher::get_or_create(
            &mut *transaction,
            guild_channel.guild_id.into(),
            user_id.into(),
            activity_name,
            guild_channel.id.into(),
        )
        .await?;

        let activity_message =
            ActivityMessage::create(&mut *transaction, activity_watcher.id, message).await?;

        transaction.commit().await?;

        Ok(activity_message)
    }

    /// Removes all triggered messages triggered by a particular
    /// user starting an activity in a channel.
    ///
    /// If `activity_name` is specified, will only remove messages
    /// for the particular activity.
    pub async fn remove_all_triggered_messages(
        &self,
        guild_channel: GuildChannel,
        user_id: UserId,
        activity_name: Option<&str>,
    ) -> anyhow::Result<Vec<ActivityMessage>> {
        let mut activity_watchers = ActivityWatcher::query_by_guild_user_channel(
            &self.pool,
            guild_channel.guild_id.into(),
            user_id.into(),
            guild_channel.id.into(),
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

    /// Attempts to remove a triggered message, and returns if the message
    /// was removed.
    pub async fn remove_triggered_message(
        &self,
        guild_channel: GuildChannel,
        user_id: UserId,
        message_id: Id,
    ) -> anyhow::Result<bool> {
        ActivityMessage::delete_by_id_if_allowed(
            &self.pool,
            message_id,
            user_id.into(),
            guild_channel.id.into(),
        )
        .await
        .map(|row| row.is_some())
        .map_err(anyhow::Error::new)
    }

    /// Gets a triggered message if a user is allowed to access it in a particular channel.
    pub async fn get_triggered_message(
        &self,
        guild_channel: GuildChannel,
        user_id: UserId,
        message_id: Id,
    ) -> anyhow::Result<Option<ActivityMessage>> {
        ActivityMessage::get_if_allowed(
            &self.pool,
            message_id,
            user_id.into(),
            guild_channel.id.into(),
        )
        .await
        .map_err(anyhow::Error::new)
    }

    /// Gets all watchers and messages in a particular channel associated
    /// with a user.
    pub async fn get_watchers_and_messages(
        &self,
        guild_channel: GuildChannel,
        user_id: UserId,
    ) -> anyhow::Result<(Vec<ActivityWatcher>, Vec<ActivityMessage>)> {
        let activity_watchers = ActivityWatcher::query_by_guild_user_channel(
            &self.pool,
            guild_channel.guild_id.into(),
            user_id.into(),
            guild_channel.id.into(),
        )
        .await?;

        let activity_messages = ActivityMessage::query_by_user_channel(
            &self.pool,
            user_id.into(),
            guild_channel.id.into(),
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
        ActivityWatcher::query_by_guild_user_activity(
            &self.pool,
            guild_id.into(),
            user_id.into(),
            activity_name,
        )
        .await
        .map_err(anyhow::Error::new)
    }

    /// Gets a random message to send for the watcher
    pub async fn query_random_message_for_watcher(
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

    /// Records an activity for a user
    pub async fn record_activity(
        &self,
        user_id: UserId,
        activity: &Activity,
    ) -> anyhow::Result<RecordedActivity> {
        RecordedActivity::get_or_create(&self.pool, user_id.into(), &activity.name)
            .await
            .map_err(anyhow::Error::new)
    }

    /// Queries all recorded activites for a user, limited to 25.
    pub async fn get_recorded_activites(
        &self,
        user_id: UserId,
    ) -> anyhow::Result<Vec<RecordedActivity>> {
        RecordedActivity::query_by_user(&self.pool, user_id.into())
            .await
            .map_err(anyhow::Error::new)
    }
}
