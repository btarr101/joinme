import { buildCommandSpec } from "./types";
import { SlashCommandBuilder } from "discord.js";

const command = buildCommandSpec("slash", {
  builder: new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong"),
  handler: async (interaction) => {
    interaction.reply("Pong!");
  },
});

export default command;
