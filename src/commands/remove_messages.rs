use anyhow::Context as _;
use poise::CreateReply;

use crate::{
    commands::autocompletes::activities_with_message_autocomplete::activities_with_message_autocomplete,
    Context, Error,
};

/// Removes all messages from this channel.
///
/// Specifying the activity will only remove messages associated
/// with that activity.
#[poise::command(slash_command, rename = "removeactivitymessages")]
pub async fn remove_messages(
    context: Context<'_>,
    #[description = "The exact name of the activity (removes all message triggers if not specified)"]
    #[autocomplete = "activities_with_message_autocomplete"]
    activity: Option<String>,
) -> Result<(), Error> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user = context.author();

    let removed_messages = context
        .data()
        .remove_all_triggered_messages(guild_channel.clone(), user.id, activity.as_deref())
        .await?;

    context
        .send(
            CreateReply::default().content(if !removed_messages.is_empty() {
                let removed_messages_len = removed_messages.len();
                tracing::info!(
                    user = %user.id,
                    username = %user.name,
                    guild = %guild_channel.guild_id,
                    channel = %guild_channel.id,
                    "User removed {} messages",
                    removed_messages_len
                );

                format!("❌ Removed {} messages!", removed_messages_len)
            } else {
                "🤔 No messages to remove.".into()
            }),
        )
        .await?;

    Ok(())
}
