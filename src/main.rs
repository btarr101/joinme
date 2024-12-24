use anyhow::Context as _;
use model::{activity_message::ActivityMessage, Id};
use poise::{
    serenity_prelude::{
        self, Activity, ChannelId, ClientBuilder, CreateAllowedMentions, CreateEmbed,
        CreateMessage, FullEvent, GatewayIntents, GetMessages, GuildChannel, Presence,
        PresenceUser,
    },
    CreateReply, FrameworkContext,
};
use shuttle_runtime::SecretStore;
use shuttle_serenity::ShuttleSerenity;
use state::State;

pub mod model;
pub mod state;

type Error = Box<dyn std::error::Error + Send + Sync>;
type Context<'a> = poise::Context<'a, State, Error>;

/// Adds a trigger to send a message whenever you start an activity (uses your most recent message).
///
/// Adding multiple messages with the same trigger will cause one to be
/// selected randomly.
#[poise::command(slash_command, rename = "addactivitymessage")]
async fn add_message(
    context: Context<'_>,
    #[description = "The exact name of the activity (what shows up in your status)"]
    activity: String,
) -> Result<(), Error> {
    let GuildChannel {
        guild_id,
        id: channel_id,
        ..
    } = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let previous_discord_messages = channel_id
        .messages(&context.http(), GetMessages::default())
        .await?;

    let previous_discord_message = previous_discord_messages
        .into_iter()
        .find(|message| message.author.id == context.author().id)
        .context("Unable to find message in recent history to use")?;

    let message = context
        .data()
        .add_message(
            user_id,
            guild_id,
            channel_id,
            &activity,
            &previous_discord_message.content,
        )
        .await?;

    let embed = CreateEmbed::default()
        .title(format!(
            "The following message may be shown when you start the activity `{}`",
            activity
        ))
        .description(message.message);

    context.send(CreateReply::default().embed(embed)).await?;
    Ok(())
}

/// Lists all of your activity messages that will be sent in this channel.
#[poise::command(slash_command, rename = "listactivitymessages")]
async fn list_messages(
    context: Context<'_>,
    #[description = "The exact name of the activity (what shows up in your status)"]
    activity: Option<String>,
) -> Result<(), Error> {
    let GuildChannel {
        guild_id,
        id: channel_id,
        ..
    } = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let (mut activity_watchers, activity_messages) = context
        .data()
        .get_watchers_and_messages(user_id, guild_id, channel_id)
        .await?;

    if let Some(activity) = activity {
        activity_watchers.retain(|activity_watcher| activity_watcher.activity_name == activity);
    }

    let embeds = activity_watchers
        .into_iter()
        .flat_map(|activity_watcher| {
            let relevant_messages = activity_messages.iter().filter(
                move |ActivityMessage {
                          activity_watcher: activity_watcher_id,
                          ..
                      }| *activity_watcher_id == activity_watcher.id,
            );

            relevant_messages.map(move |relevant_message| {
                CreateEmbed::default()
                    .title(format!(
                        "Message Id `#{}` for `{}`",
                        relevant_message.id, activity_watcher.activity_name
                    ))
                    .description(&relevant_message.message)
            })
        })
        .collect::<Vec<_>>();

    let reply = if embeds.is_empty() {
        CreateReply::default().content("No messages or triggers")
    } else {
        embeds
            .into_iter()
            .fold(CreateReply::default(), |reply, embed| reply.embed(embed))
    };

    context.send(reply).await?;
    Ok(())
}

/// Removes all messages from this channel.
///
/// Specifying the activity will only remove messages associated
/// with that activity.
#[poise::command(slash_command, rename = "removeactivitymessages")]
async fn remove_messages(
    context: Context<'_>,
    #[description = "The exact name of the activity (removes all message triggers if not specified)"]
    activity: Option<String>,
) -> Result<(), Error> {
    let GuildChannel {
        guild_id,
        id: channel_id,
        ..
    } = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let removed_messages = context
        .data()
        .remove_messages(user_id, guild_id, channel_id, activity.as_deref())
        .await?;

    context
        .send(
            CreateReply::default().content(format!("Removed {} messages", removed_messages.len())),
        )
        .await?;

    Ok(())
}

/// Removes a message given its id. Must be in the channel the message triggers in.
#[poise::command(slash_command, rename = "removeactivitymessage")]
async fn remove_message(
    context: Context<'_>,
    #[description = "The Id of the message to remove"] message_id: Id,
) -> Result<(), Error> {
    let GuildChannel {
        guild_id,
        id: channel_id,
        ..
    } = context
        .guild_channel()
        .await
        .context("Command must be ran from within a guild")?;
    let user_id = context.author().id;

    let deleted = context
        .data()
        .remove_message(user_id, guild_id, channel_id, message_id)
        .await?;
    let content = if deleted {
        "Deleted message!"
    } else {
        "Could not find message to delete"
    };

    context
        .send(CreateReply::default().content(content))
        .await?;

    Ok(())
}

async fn event_handler(
    context: &serenity_prelude::Context,
    event: &FullEvent,
    _framework: FrameworkContext<'_, State, Error>,
    state: &State,
) -> Result<(), Error> {
    match event {
        FullEvent::PresenceUpdate {
            new_data:
                Presence {
                    user: PresenceUser { id: user_id, .. },
                    guild_id: Some(guild_id),
                    activities,
                    ..
                },
            ..
        } => {
            for Activity {
                name: activity_name,
                created_at,
                ..
            } in activities
            {
                let activity_watchers = state
                    .get_watchers(*user_id, *guild_id, activity_name)
                    .await?;
                for mut activity_watcher in
                    activity_watchers.into_iter().filter(|activity_watcher| {
                        activity_watcher
                            .last_triggered
                            .map(|datetime| datetime.timestamp_millis() as u64)
                            .unwrap_or(0)
                            < *created_at
                    })
                {
                    if let Some(activity_message) = state
                        .get_random_message_for_watcher(&activity_watcher)
                        .await?
                    {
                        let channel_id = ChannelId::from(activity_watcher.channel_id as u64);
                        channel_id
                            .send_message(
                                &context.http,
                                CreateMessage::new()
                                    .content(&activity_message.message)
                                    .allowed_mentions(CreateAllowedMentions::new().all_roles(true)),
                            )
                            .await?;
                        state
                            .update_last_triggered_for_watcher(&mut activity_watcher)
                            .await?;
                        tracing::info!(
                            "Sent message @ {}: {:?}",
                            activity_watcher.last_triggered.expect("trigger"),
                            activity_message
                        );
                    }
                }
            }
        }
        event => {
            tracing::trace!("Skipped event: {:?}", event);
        }
    }
    Ok(())
}

#[shuttle_runtime::main]
async fn main(
    #[shuttle_runtime::Secrets] secret_store: SecretStore,
    #[shuttle_shared_db::Postgres] pool: sqlx::PgPool,
) -> ShuttleSerenity {
    sqlx::migrate!()
        .run(&pool)
        .await
        .map_err(shuttle_runtime::CustomError::new)?;

    let discord_token = secret_store
        .get("DISCORD_TOKEN")
        .context("Missing `DISCORD_TOKEN`")?;

    let intents = GatewayIntents::non_privileged()
        | GatewayIntents::GUILD_PRESENCES
        | GatewayIntents::MESSAGE_CONTENT;

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: vec![
                add_message(),
                list_messages(),
                remove_messages(),
                remove_message(),
            ],
            event_handler: |ctx, event, framework, data| {
                Box::pin(event_handler(ctx, event, framework, data))
            },
            ..Default::default()
        })
        .setup(|ctx, _ready, framework| {
            Box::pin(async move {
                poise::builtins::register_globally(ctx, &framework.options().commands).await?;
                Ok(State { pool })
            })
        })
        .build();

    let client = ClientBuilder::new(discord_token, intents)
        .framework(framework)
        .await
        .map_err(shuttle_runtime::CustomError::new)?;

    Ok(client.into())
}
