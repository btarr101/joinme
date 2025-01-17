use anyhow::Context as _;
use poise::{serenity_prelude::CreateEmbed, CreateReply};

use crate::{
    commands::autocompletes::activities_with_message_autocomplete::activities_with_message_autocomplete_silenced,
    Context, Error,
};

/// Unsilences your activity messages that will be sent in this channel.
///
/// If an activity is specified, only unsilences that particular activity.
#[poise::command(slash_command, ephemeral, rename = "unsilence")]
pub async fn unsilence(
    context: Context<'_>,
    #[description = "The exact name of the activity (what shows up in your status) to unsilence"]
    #[autocomplete = "activities_with_message_autocomplete_silenced"]
    activity: Option<String>,
) -> Result<(), Error> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let (mut activity_watchers, _) = context
        .data()
        .get_watchers_and_messages(guild_channel, user_id)
        .await?;

    if let Some(activity) = &activity {
        activity_watchers.retain(|activity_watcher| activity_watcher.activity_name == *activity);
    }

    let state = context.data();

    for activity_watcher in &mut activity_watchers {
        state.unsilence_watcher(activity_watcher).await?;
    }

    let embeds = activity_watchers
        .into_iter()
        .map(|activity_watcher| {
            CreateEmbed::default().title(format!("Activity `{}`", activity_watcher.activity_name))
        })
        .collect::<Vec<_>>();

    let reply = if embeds.is_empty() {
        CreateReply::default().content("🤔 No recorded activities found, so none awaken.")
    } else {
        embeds.into_iter().fold(
            CreateReply::default().content("### 🌞 The following activities were unsilenced"),
            |reply, embed| reply.embed(embed),
        )
    };

    context.send(reply).await?;
    Ok(())
}
