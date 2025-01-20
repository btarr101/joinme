use state::State;

pub mod commands;
pub mod event_handler;
pub mod model;
pub mod state;
pub mod tracing;

pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Context<'a> = poise::Context<'a, State, Error>;
