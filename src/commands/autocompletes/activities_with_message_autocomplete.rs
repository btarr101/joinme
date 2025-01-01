use anyhow::Context as _;

use crate::Context;

/// Autocompletes the activity for a particular user based on recorded activities.
pub async fn activities_with_message_autocomplete(
    context: Context<'_>,
    _partial: &str,
) -> Vec<String> {
    let user_id = context.author().id;

    activities_with_message_autocomplete_with_errors(context)
        .await
        .map(|iter| iter.collect::<Vec<_>>())
        .unwrap_or_else(|err| {
            tracing::error!("Failed to autocomplete for user {}: {}", user_id, err);
            vec![]
        })
}

async fn activities_with_message_autocomplete_with_errors(
    context: Context<'_>,
) -> anyhow::Result<impl Iterator<Item = String>> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;

    let user_id = context.author().id;
    let (watchers, _) = context
        .data()
        .get_watchers_and_messages(guild_channel, user_id)
        .await?;

    Ok(watchers
        .into_iter()
        .take(25)
        .map(|watcher| watcher.activity_name))
}
