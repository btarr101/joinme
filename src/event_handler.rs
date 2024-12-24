use poise::{
    serenity_prelude,
    serenity_prelude::{
        Activity, ChannelId, CreateAllowedMentions, CreateMessage, FullEvent, Presence,
        PresenceUser,
    },
    FrameworkContext,
};
use sqlx::types::chrono::{DateTime, Utc};

use crate::{state::State, Error};

pub async fn event_handler(
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
                tracing::info!(
                    "Activity update for user {} & guild {}: \"{}\" created @ {}",
                    user_id,
                    guild_id,
                    activity_name,
                    DateTime::<Utc>::from_timestamp_millis(*created_at as i64)
                        .expect("no out of range")
                );

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
                        .query_random_message_for_watcher(&activity_watcher)
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
                            "Sent message @ {}: {}",
                            activity_watcher.last_triggered.expect("trigger"),
                            activity_message.message
                        );
                    }
                }
            }
        }
        event => {
            tracing::debug!("Skipped event: {:?}", event);
        }
    }
    Ok(())
}
