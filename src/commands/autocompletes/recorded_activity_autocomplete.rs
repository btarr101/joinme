use crate::Context;

/// Autocompletes the activity for a particular user based on recorded activities.
pub async fn recorded_activity_autocomplete(
    context: Context<'_>,
    _partial: &str,
) -> impl Iterator<Item = String> {
    let user = context.author();
    context
        .data()
        .get_recorded_activites(user.id)
        .await
        .unwrap_or_else(|err| {
            tracing::error!(
                user = %user.id,
                username = %user.name,
                error = %err,
                "Failed to autocomplete",
            );
            vec![]
        })
        .into_iter()
        .map(|recorded_activity| recorded_activity.activity_name)
        .take(25)
}
