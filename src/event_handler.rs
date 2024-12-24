use poise::{
    serenity_prelude,
    serenity_prelude::{
        ChannelId, CreateAllowedMentions, CreateMessage, FullEvent, Presence, PresenceUser,
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
            for activity in activities
                .iter()
                .filter(|activity| !activity.name.is_empty())
            {
                let activity_timestamp =
                    DateTime::<Utc>::from_timestamp_millis(activity.created_at as i64)
                        .expect("no out of range");

                if let Err(err) = state.record_activity(*user_id, activity).await {
                    tracing::warn!(
                        "Failed to record activity for user {} & guild {}: \"{}\" created @ {}: {}",
                        user_id,
                        guild_id,
                        activity.name,
                        activity_timestamp,
                        err
                    )
                } else {
                    tracing::info!(
                        "Recorded activity update for user {} & guild {}: \"{}\" created @ {}",
                        user_id,
                        guild_id,
                        activity.name,
                        activity_timestamp
                    );
                }

                let activity_watchers = state
                    .get_watchers(*user_id, *guild_id, &activity.name)
                    .await?;
                for mut activity_watcher in
                    activity_watchers.into_iter().filter(|activity_watcher| {
                        activity_watcher
                            .last_triggered
                            .map(|datetime| datetime.timestamp_millis() as u64)
                            .unwrap_or(0)
                            < activity.created_at
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
