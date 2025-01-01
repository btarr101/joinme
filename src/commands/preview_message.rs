use anyhow::Context as _;
use poise::{serenity_prelude::CreateAllowedMentions, CreateReply};

use crate::{model::Id, Context, Error};

/// Previews a message given its id. Must be in the channel the message triggers in.
#[poise::command(slash_command, rename = "previewactivitymessage")]
pub async fn preview_message(
    context: Context<'_>,
    #[description = "The Id of the message to preview"] message_id: Id,
) -> Result<(), Error> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let activity_message = context
        .data()
        .get_triggered_message(guild_channel.clone(), user_id, message_id)
        .await?;

    if let Some(activity_message) = activity_message {
        context
            .send(
                CreateReply::default()
                    .content(&activity_message.message)
                    .allowed_mentions(CreateAllowedMentions::new().all_roles(true)),
            )
            .await?;
    } else {
        context
            .send(CreateReply::default().content("😕 Unable to preview message."))
            .await?;
    }

    Ok(())
}
