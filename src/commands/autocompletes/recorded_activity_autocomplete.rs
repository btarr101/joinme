use crate::Context;

/// Autocompletes the activity for a particular user based on recorded activities.
pub async fn recorded_activity_autocomplete(
    context: Context<'_>,
    _partial: &str,
) -> impl Iterator<Item = String> {
    let user_id = context.author().id;
    context
        .data()
        .get_recorded_activites(user_id)
        .await
        .unwrap_or_else(|err| {
            tracing::error!("Failed to autocomplete for user {}: {}", user_id, err);
            vec![]
        })
        .into_iter()
        .map(|recorded_activity| recorded_activity.activity_name)
        .take(25)
}
