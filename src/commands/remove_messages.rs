use anyhow::Context as _;
use poise::CreateReply;

use crate::{Context, Error};

/// Removes all messages from this channel.
///
/// Specifying the activity will only remove messages associated
/// with that activity.
#[poise::command(slash_command, rename = "removeactivitymessages")]
pub async fn remove_messages(
    context: Context<'_>,
    #[description = "The exact name of the activity (removes all message triggers if not specified)"]
    activity: Option<String>,
) -> Result<(), Error> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let removed_messages = context
        .data()
        .remove_all_triggered_messages(guild_channel, user_id, activity.as_deref())
        .await?;

    context
        .send(
            CreateReply::default().content(if !removed_messages.is_empty() {
                format!("❌ Removed {} messages!", removed_messages.len())
            } else {
                "🤔 No messages to remove.".into()
            }),
        )
        .await?;

    Ok(())
}
