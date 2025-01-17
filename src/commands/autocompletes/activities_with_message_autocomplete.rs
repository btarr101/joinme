use anyhow::Context as _;
use sqlx::types::chrono::Utc;

use crate::{model::activity_watcher::ActivityWatcher, Context};

/// Autocompletes the activity for a particular user based on recorded activities.
pub async fn activities_with_message_autocomplete(
    context: Context<'_>,
    _partial: &str,
) -> Vec<String> {
    activities_with_message_autocomplete_base(context, None).await
}

/// Autocompletes the activity for a particular user based on recorded currently silenced activities.
pub async fn activities_with_message_autocomplete_silenced(
    context: Context<'_>,
    _partial: &str,
) -> Vec<String> {
    activities_with_message_autocomplete_base(context, Some(true)).await
}

/// Autocompletes the activity for a particular user based on recorded currently unsilenced activities.
pub async fn activities_with_message_autocomplete_unsilenced(
    context: Context<'_>,
    _partial: &str,
) -> Vec<String> {
    activities_with_message_autocomplete_base(context, Some(false)).await
}

pub async fn activities_with_message_autocomplete_base(
    context: Context<'_>,
    silenced: Option<bool>,
) -> Vec<String> {
    let user_id = context.author().id;

    activities_with_message_autocomplete_with_errors(context)
        .await
        .map(|iter| {
            let now = Utc::now();
            iter.filter(|watcher| match silenced {
                Some(silenced_filter) => silenced_filter == watcher.is_silenced(now),
                None => true,
            })
            .map(|watcher| watcher.activity_name)
            .collect::<Vec<_>>()
        })
        .unwrap_or_else(|err| {
            tracing::error!("Failed to autocomplete for user {}: {}", user_id, err);
            vec![]
        })
}

async fn activities_with_message_autocomplete_with_errors(
    context: Context<'_>,
) -> anyhow::Result<impl Iterator<Item = ActivityWatcher>> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;

    let user_id = context.author().id;
    let (watchers, _) = context
        .data()
        .get_watchers_and_messages(guild_channel, user_id)
        .await?;

    Ok(watchers.into_iter())
}
