import { commandBuilders } from "./commands";
import env from "./lib/env";
import logger from "./lib/logger";
import runtimeConfig from "./runtime-config";
import { Client, REST, Routes } from "discord.js";

const rest = new REST().setToken(env.DISCORD_TOKEN);

export const handleClientReady = async (readyClient: Client<true>) => {
  logger.info(`Ready! Logged in as ${readyClient.user.tag}`);

  if (!runtimeConfig.registerCommands) return;

  const application = await readyClient.application.fetch();
  const clientId = application.id;

  logger.info(`Registering commands...`);

  await rest.put(Routes.applicationCommands(clientId), {
    body: commandBuilders.map((builder) => builder.toJSON()),
  });

  logger.info(`Commands registered!`);
};
