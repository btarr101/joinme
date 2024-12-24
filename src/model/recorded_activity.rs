use sqlx::{Executor, Postgres};

use super::DiscordId;

/// Table for checking recorded activities.
#[derive(sqlx::FromRow, Debug)]
pub struct RecordedActivity {
    pub user_id: DiscordId,
    pub activity_name: String,
}

impl RecordedActivity {
    /// Gets or creates a recorded activity, adhering to database constraints.
    pub async fn get_or_create<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        user_id: DiscordId,
        activity_name: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as_unchecked!(
            RecordedActivity,
            "
            WITH inserted AS (
                INSERT INTO recorded_activity (user_id, activity_name)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                RETURNING *
            )
            SELECT * FROM inserted
            UNION ALL
            SELECT * FROM recorded_activity
            WHERE user_id=$1 AND activity_name=$2
            LIMIT 1
            ",
            user_id,
            activity_name
        )
        .fetch_one(executor)
        .await
    }

    /// Queries all recorded activites by user, limited to 25 entries.
    pub async fn query_by_user<'a, E: Executor<'a, Database = Postgres>>(
        executor: E,
        user_id: DiscordId,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            RecordedActivity,
            "SELECT * FROM recorded_activity WHERE user_id = $1 LIMIT 25",
            user_id,
        )
        .fetch_all(executor)
        .await
    }
}
