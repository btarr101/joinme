use anyhow::Context as _;

use crate::Context;

/// Autocompletes the message id.
pub async fn channel_message_ids_autocomplete(context: Context<'_>, partial: &str) -> Vec<String> {
    let user = context.author();

    channel_message_ids_autocomplete_with_errors(context, partial)
        .await
        .map(|iter| iter.collect::<Vec<_>>())
        .unwrap_or_else(|err| {
            tracing::error!(
                user = %user.id,
                username = %user.name,
                error = %err,
                "Failed to autocomplete",
            );
            vec![]
        })
}

pub async fn channel_message_ids_autocomplete_with_errors(
    context: Context<'_>,
    _partial: &str,
) -> anyhow::Result<impl Iterator<Item = String>> {
    let user_id = context.author().id;
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;

    let (_, messages) = context
        .data()
        .get_watchers_and_messages(guild_channel, user_id)
        .await?;

    Ok(messages
        .into_iter()
        .take(25)
        .map(|message| message.id.to_string()))
}
