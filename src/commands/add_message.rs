use anyhow::Context as _;
use poise::{
    serenity_prelude::{CreateEmbed, GetMessages},
    CreateReply,
};

use crate::{Context, Error};

/// Adds a trigger to send a message whenever you start an activity (uses your most recent message).
///
/// Adding multiple messages with the same trigger will cause one to be
/// selected randomly.
#[poise::command(slash_command, rename = "addactivitymessage")]
pub async fn add_message(
    context: Context<'_>,
    #[description = "The exact name of the activity (what shows up in your status)"]
    activity: String,
) -> Result<(), Error> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let previous_discord_messages = guild_channel
        .messages(&context.http(), GetMessages::default())
        .await?;

    let previous_discord_message = previous_discord_messages
        .into_iter()
        .find(|message| message.author.id == context.author().id && !message.content.is_empty())
        .context("Unable to find message in recent history to use")?;

    let message = context
        .data()
        .add_triggered_message(
            guild_channel.clone(),
            user_id,
            &activity,
            &previous_discord_message.content,
        )
        .await?;

    let embed = CreateEmbed::default()
        .title(format!(
            "Message Id `{}` for activity `{}`",
            message.id, activity
        ))
        .description(message.message);

    context
        .send(
            CreateReply::default()
                .content("### 📬 Message added!")
                .embed(embed),
        )
        .await?;

    tracing::info!(
        "User {} added message {} for \"{}\" in guild {}, channel {}",
        user_id,
        message.id,
        activity,
        guild_channel.guild_id,
        guild_channel.id,
    );

    Ok(())
}
