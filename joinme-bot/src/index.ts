import { commandBuilders, commandHandlers } from "./commands";
import { CommandInteractionByType, CommandType } from "./commands/types";
import { activityMessageEntity, recordedActivity, table } from "./lib/dynamo";
import env from "./lib/env";
import logger from "./lib/logger";
import { extractInteractionCommand } from "./util/get-interaction-command-type";
import { randomUUID } from "crypto";
import { Events, REST, Routes, StringSelectMenuInteraction } from "discord.js";
import { Client, GatewayIntentBits } from "discord.js";
import { QueryCommand } from "dynamodb-toolbox";
import { PutItemCommand } from "dynamodb-toolbox";
import { BatchPutRequest, BatchWriteCommand } from "dynamodb-toolbox";
import { execute } from "dynamodb-toolbox/table/actions/batchWrite";
import pino from "pino";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences] });
const rest = new REST().setToken(env.DISCORD_TOKEN);

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Ready! Logged in as ${readyClient.user.tag}`);

  const application = await readyClient.application.fetch();
  const clientId = application.id;

  const guilds = await readyClient.guilds.fetch();

  for (const [guildId] of guilds) {
    logger.info(`Registering commands for guild '${guildId}'...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandBuilders.map((builder) => builder.toJSON()),
    });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  logger.info(interaction, "Received interaction");
  const interactionLogger = logger.child({ interactionId: interaction.id });

  if (interaction.isStringSelectMenu()) return await handleStringSelectMenuInteraction(interaction, logger);

  const { ty, interaction: commandInteraction } = extractInteractionCommand(interaction);
  if (ty) return await handleCommandInteraction(ty, commandInteraction, interactionLogger);
});

const handleCommandInteraction = async <TCommandType extends CommandType>(
  ty: TCommandType,
  interaction: CommandInteractionByType<TCommandType>,
  logger: pino.Logger,
) => {
  const commandName = interaction.commandName;
  const handler = commandHandlers[ty]?.[commandName];
  if (!handler) {
    logger.error({ ty, commandName }, "Unrecognized command");
    await interaction.reply(`⚠️ Unrecognized '${ty}' command: ${commandName}`);
    return;
  }

  const interactionHandlerLogger = logger.child({ ty, commandName });

  try {
    interactionHandlerLogger.info("Handling interaction...");
    await handler(interaction, interactionHandlerLogger);
    interactionHandlerLogger.info("Handled interaction successfully!");
  } catch (error) {
    interactionHandlerLogger.error(error, "Error handling interaction");
  }
};

const handleStringSelectMenuInteraction = async (interaction: StringSelectMenuInteraction, logger: pino.Logger) => {
  if (interaction.customId === "select-activity") {
    const { messageId, activityName } = JSON.parse(interaction.values[0]!) as {
      messageId: string;
      activityName: string;
    };

    const message = await interaction.channel?.messages.fetch(messageId);
    if (!message) {
      logger.error({ messageId }, "Could not find original message");
      return;
    }

    logger.info("Creating message in dynamo...");

    await activityMessageEntity
      .build(PutItemCommand)
      .item({
        uuid: randomUUID(),
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        channelId: interaction.channelId,
        activityName,
        content: message.content,
      })
      .send();

    logger.info("Saved message!");

    await interaction.update({
      content: `The message will be sent in this channel whenever you start \`${activityName}\`.`,
      components: [],
    });
  }
};

client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
  if (!newPresence) return;
  const userId = newPresence.userId;

  const oldActivities = oldPresence?.activities ?? [];
  const newActivities = newPresence.activities.filter(
    (activity) => !oldActivities.some(({ name }) => name === activity.name),
  );

  if (!newActivities.length) return;

  logger.info(newPresence, "Received prescense update!");

  await execute(
    table.build(BatchWriteCommand).requests(
      ...newActivities.map(({ name }) =>
        recordedActivity.build(BatchPutRequest).item({
          userId,
          activityName: name,
        }),
      ),
    ),
  );

  const guild = newPresence.guild;
  if (!guild) {
    logger.warn("Guild not included in presence update");
    return;
  }

  const messagesToSend = (
    await Promise.all(
      newActivities.map(async ({ name }) => {
        const messages =
          (
            await table
              .build(QueryCommand)
              .entities(activityMessageEntity)
              .query({
                partition: `USER#${userId}`,
                range: {
                  beginsWith: `ACTIVITY_MESSAGE#${name}#${guild.id}`,
                },
              })
              .send()
          ).Items ?? [];

        const chosenMessageIndex = Math.floor(Math.random() * messages?.length);
        const chosenMessage = messages[chosenMessageIndex];

        return chosenMessage ? [chosenMessage] : [];
      }),
    )
  ).flat();

  logger.info(messagesToSend, "Sending messages");

  await Promise.all(
    messagesToSend.map(async (message) => {
      const channel = await guild.channels.fetch(message.channelId);
      if (!channel) {
        logger.warn({ channelId: message.channelId, guildId: guild.id }, "Channel not found in guild!");
        return;
      }

      if (!channel.isTextBased()) {
        logger.warn({ channelId: message.channelId, guildId: guild.id }, "Channel in guild is not text based!");
        return;
      }

      await channel.send({ content: message.content });
    }),
  );

  logger.info("Sent messages");
});

client.login(env.DISCORD_TOKEN);
