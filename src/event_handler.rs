use std::time::Duration;

use poise::{
    serenity_prelude::{
        self, ChannelId, CreateAllowedMentions, CreateMessage, FullEvent, Presence,
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
                    user,
                    guild_id: Some(guild_id),
                    activities,
                    ..
                },
            ..
        } => {
            for activity in activities
                .iter()
                .filter(|activity| !activity.name.is_empty())
            {
                let activity_timestamp = DateTime::<Utc>::from_timestamp_millis(
                    activity
                        .timestamps
                        .clone()
                        .map(|timestamps| timestamps.start.unwrap_or(0))
                        .unwrap_or(0) as i64,
                )
                .expect("no out of range");

                if let Err(err) = state.record_activity(user.id, activity).await {
                    tracing::warn!(
                        user = %user.id,
                        username = ?user.name,
                        guild = %guild_id,
                        activity = activity.name,
                        activity_timestamp = %activity_timestamp,
                        error = %err,
                        "Failed to record activity update",
                    );
                } else {
                    tracing::trace!(
                        user = %user.id,
                        username = ?user.name,
                        guild = %guild_id,
                        activity = activity.name,
                        activity_timestamp = %activity_timestamp,
                        "Recorded activity update",
                    );
                }

                let activity_watchers = state
                    .get_watchers(user.id, *guild_id, &activity.name)
                    .await?;
                for mut activity_watcher in
                    activity_watchers.into_iter().filter(|activity_watcher| {
                        let last_triggered = activity_watcher
                            .last_triggered
                            .map(|datetime| datetime.timestamp_millis() as u64)
                            .unwrap_or(0);

                        last_triggered < activity_timestamp.timestamp_millis() as u64
                    })
                {
                    let now = Utc::now();
                    if activity_watcher.is_silenced(now) {
                        tracing::info!(
                            user = %user.id,
                            username = ?user.name,
                            guild = %guild_id,
                            activity = activity.name,
                            activity_timestamp = %activity_timestamp,
                            "Watcher {} for activity would of triggered, but is silenced until {:?}",
                            activity_watcher.id,
                            activity_watcher.silenced_until
                        );
                    } else if let Some(activity_message) = state
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

                        // We silence the watcher for 5 minutes, since sometimes there are blips where the activity
                        // can start twice.
                        let silence_until = Utc::now() + Duration::new(60 * 5, 0);
                        state
                            .silence_watcher_until(&mut activity_watcher, silence_until)
                            .await?;

                        tracing::info!(
                            user = %user.id,
                            username = ?user.name,
                            guild = %guild_id,
                            activity = activity.name,
                            activity_timestamp = %activity_timestamp,
                            "Watcher {} sent message {} @ {}: {}! It is now silenced for 5 minutes.",
                            activity_watcher.id,
                            activity_message.id,
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
