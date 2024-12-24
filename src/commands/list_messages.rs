use anyhow::Context as _;
use poise::{serenity_prelude::CreateEmbed, CreateReply};

use crate::{Context, Error};

/// Lists all of your activity messages that will be sent in this channel.
#[poise::command(slash_command, rename = "listactivitymessages")]
pub async fn list_messages(
    context: Context<'_>,
    #[description = "The exact name of the activity (what shows up in your status)"]
    activity: Option<String>,
) -> Result<(), Error> {
    let guild_channel = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let (mut activity_watchers, activity_messages) = context
        .data()
        .get_watchers_and_messages(guild_channel, user_id)
        .await?;

    if let Some(activity) = &activity {
        activity_watchers.retain(|activity_watcher| activity_watcher.activity_name == *activity);
    }

    let embeds = activity_watchers
        .into_iter()
        .flat_map(|activity_watcher| {
            let relevant_messages = activity_messages
                .iter()
                .filter(move |message| message.activity_watcher == activity_watcher.id);

            relevant_messages.map(move |relevant_message| {
                CreateEmbed::default()
                    .title(format!(
                        "Message Id `{}` for `{}`",
                        relevant_message.id, activity_watcher.activity_name
                    ))
                    .description(&relevant_message.message)
            })
        })
        .collect::<Vec<_>>();

    let reply = if embeds.is_empty() {
        let commands = context.http().get_global_commands().await?;
        let command = commands
            .into_iter()
            .find(|command| command.name == "addactivitymessage")
            .expect("a command");

        CreateReply::default().content(format!(
            "🤔 No activity messages, create one with </{}:{}>.",
            command.name, command.id
        ))
    } else {
        let mut content = "### 📬 Listing messages".to_string();
        if let Some(activity) = &activity {
            content = format!("{content} for `{activity}`");
        }

        embeds
            .into_iter()
            .fold(CreateReply::default().content(content), |reply, embed| {
                reply.embed(embed)
            })
    };

    context.send(reply).await?;
    Ok(())
}
