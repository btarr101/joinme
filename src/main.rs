use anyhow::Context as _;
use joinme_v2::{
    commands::get_commands,
    event_handler::event_handler,
    state::State,
    tracing::{setup_tracing, TracingConfig},
};
use poise::serenity_prelude::{ClientBuilder, GatewayIntents};
use shuttle_runtime::SecretStore;
use shuttle_serenity::ShuttleSerenity;

#[shuttle_runtime::main]
async fn main(
    #[shuttle_runtime::Secrets] secret_store: SecretStore,
    #[shuttle_shared_db::Postgres] pool: sqlx::PgPool,
) -> ShuttleSerenity {
    let grafana_host = secret_store
        .get("GRAFANA_HOST")
        .context("missing GRAFANA_HOST")?;
    let grafana_username = secret_store
        .get("GRAFANA_USERNAME")
        .context("missing GRAFANA_USERNAME")?;
    let grafana_password = secret_store
        .get("GRAFANA_PASSWORD")
        .context("missing GRAFANA_PASSWORD")?;

    setup_tracing(TracingConfig {
        grafana_host: &grafana_host,
        grafana_username: &grafana_username,
        grafana_password: &grafana_password,
    })
    .await?;

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
            commands: get_commands(),
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
