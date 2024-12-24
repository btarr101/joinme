use poise::structs::Command;

use crate::{state::State, Error};

pub mod add_message;
pub mod autocompletes;
pub mod list_messages;
pub mod remove_message;
pub mod remove_messages;

pub fn get_commands() -> Vec<Command<State, Error>> {
    vec![
        add_message::add_message(),
        list_messages::list_messages(),
        remove_messages::remove_messages(),
        remove_message::remove_message(),
    ]
}
