use std::process;

use base64::{prelude::BASE64_STANDARD, Engine};
use tracing::level_filters::LevelFilter;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use url::Url;

pub struct TracingConfig<'a> {
    pub grafana_host: &'a str,
    pub grafana_username: &'a str,
    pub grafana_password: &'a str,
}

pub async fn setup_tracing(
    TracingConfig {
        grafana_host,
        grafana_username,
        grafana_password,
    }: TracingConfig<'_>,
) -> anyhow::Result<()> {
    let environment = if cfg!(debug_assertions) {
        "dev"
    } else {
        "prod"
    };

    let grafana_basic_auth =
        BASE64_STANDARD.encode(format!("{grafana_username}:{grafana_password}").as_bytes());

    let (layer, task) = tracing_loki::builder()
        .label("application", "joinme")
        .expect("valid label")
        .label("environment", environment)
        .expect("valid label")
        .extra_field("pid", format!("{}", process::id()))
        .expect("valid field")
        .http_header("Authorization", format!("Basic {grafana_basic_auth}"))
        .expect("valid header")
        .build_url(Url::parse(grafana_host).map_err(anyhow::Error::new)?)
        .map_err(anyhow::Error::new)?;

    let filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::Layer::new())
        .with(layer)
        .init();

    tokio::task::spawn(task);

    Ok(())
}
