use std::time::Duration;

use anyhow::Context as _;
use poise::{serenity_prelude::CreateEmbed, CreateReply};
use sqlx::types::chrono::{DateTime, Utc};

use crate::{
    commands::autocompletes::activities_with_message_autocomplete::activities_with_message_autocomplete_unsilenced,
    Context, Error,
};

#[derive(poise::ChoiceParameter)]
pub enum SilenceForOption {
    #[name = "1 hour"]
    Hour,
    #[name = "3 hours"]
    ThreeHours,
    #[name = "1 day"]
    Day,
    #[name = "1 week"]
    Week,
}

impl From<SilenceForOption> for Duration {
    fn from(value: SilenceForOption) -> Self {
        match value {
            SilenceForOption::Hour => Duration::new(3600, 0),
            SilenceForOption::ThreeHours => Duration::new(10800, 0),
            SilenceForOption::Day => Duration::new(86400, 0),
            SilenceForOption::Week => Duration::new(604800, 0),
        }
    }
}

/// Silences your activity messages that will be sent in this channel.
///
/// If an activity is specified, only silences that particular activity.
#[poise::command(slash_command, ephemeral, rename = "silence")]
pub async fn silence(
    context: Context<'_>,
    #[description = "The exact name of the activity (what shows up in your status) to silence"]
    #[autocomplete = "activities_with_message_autocomplete_unsilenced"]
    activity: Option<String>,
    #[description = "Specify if you want to silence for a period of time (otherwise silences until combat shall evolve)"]
    #[rename = "for"]
    silence_for: Option<SilenceForOption>,
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

    let silence_until = silence_for
        .map(|silence_for| Utc::now() + Duration::from(silence_for))
        .unwrap_or(DateTime::from_timestamp_millis(18388817021).expect("valid ts"));

    let state = context.data();

    for activity_watcher in &mut activity_watchers {
        state
            .silence_watcher_until(activity_watcher, silence_until)
            .await?;
    }

    let embeds = activity_watchers
        .into_iter()
        .map(|activity_watcher| {
            let timestamp = activity_watcher.silenced_until.expect("silenced");

            CreateEmbed::default()
                .title(format!("Activity `{}`", activity_watcher.activity_name))
                .description(format!(
                    "Silenced until {} {}",
                    timestamp.format("%A, %B %d, %Y at %I:%M %p"),
                    timestamp.timezone()
                ))
        })
        .collect::<Vec<_>>();

    let reply = if embeds.is_empty() {
        CreateReply::default().content("🤔 No recorded activities found, so none silenced.")
    } else {
        embeds.into_iter().fold(
            CreateReply::default().content("### 🤫 The following activities were silenced"),
            |reply, embed| reply.embed(embed),
        )
    };

    context.send(reply).await?;
    Ok(())
}
