use anyhow::Context as _;
use poise::CreateReply;

use crate::{
    commands::autocompletes::channel_message_ids_autocomplete::channel_message_ids_autocomplete,
    model::Id, Context, Error,
};

/// Removes a message given its id. Must be in the channel the message triggers in.
#[poise::command(slash_command, rename = "removeactivitymessage")]
pub async fn remove_message(
    context: Context<'_>,
    #[description = "The Id of the message to remove"]
    #[autocomplete = "channel_message_ids_autocomplete"]
    message_id: Id,
) -> Result<(), Error> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let deleted = context
        .data()
        .remove_triggered_message(guild_channel.clone(), user_id, message_id)
        .await?;

    context
        .send(CreateReply::default().content(if deleted {
            tracing::info!(
                "User {} removed message {} in guild {}, channel {}",
                user_id,
                message_id,
                guild_channel.guild_id,
                guild_channel.id,
            );

            "❌ Deleted message!"
        } else {
            "😕 Could not delete message."
        }))
        .await?;

    Ok(())
}
