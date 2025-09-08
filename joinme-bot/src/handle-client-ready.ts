import { commandBuilders } from "./commands";
import logger from "./lib/logger";
import rest from "./lib/rest";
import runtimeConfig from "./runtime-config";
import { Client, Routes } from "discord.js";

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
