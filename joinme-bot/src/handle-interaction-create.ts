import { commandHandlers } from "./commands";
import { CommandInteractionByType, CommandType } from "./commands/types";
import { activityMessageEntity, queryActivityMessages } from "./lib/dynamo";
import logger from "./lib/logger";
import { uploadAttachment } from "./lib/s3";
import { extractInteractionCommand } from "./util/get-interaction-command-type";
import assert from "assert";
import { randomUUID } from "crypto";
import {
  ApplicationCommandOptionChoiceData,
  Attachment,
  AutocompleteInteraction,
  Interaction,
  StringSelectMenuInteraction,
} from "discord.js";
import { PutItemCommand } from "dynamodb-toolbox";
import pino from "pino";
import { Readable } from "stream";

export const handleInteraction = async (interaction: Interaction) => {
  logger.info(interaction, "Received interaction");

  const interactionLogger = logger.child({ interactionId: interaction.id });

  try {
    if (interaction.isStringSelectMenu())
      return await handleStringSelectMenuInteraction(interaction, interactionLogger);

    if (interaction.isAutocomplete()) return await handleAutocomplete(interaction, interactionLogger);

    const { ty, interaction: commandInteraction } = extractInteractionCommand(interaction);
    if (ty) return await handleCommandInteraction(ty, commandInteraction, interactionLogger);
  } catch (error) {
    interactionLogger.error(error, "Error handling interaction");
  }
};

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

  await handler(interaction, interactionHandlerLogger);
};

const handleStringSelectMenuInteraction = async (interaction: StringSelectMenuInteraction, logger: pino.Logger) => {
  if (interaction.customId === "select-activity") {
    assert(interaction.guildId);

    const { messageId, activityName } = JSON.parse(interaction.values[0]!) as {
      messageId: string;
      activityName: string;
    };

    const message = await interaction.channel?.messages.fetch(messageId);
    if (!message) {
      logger.error({ messageId }, "Could not find original message");
      return;
    }

    const messageUUID = randomUUID();

    const discordAttachments: Attachment[] = [];
    for (const attachment of message.attachments.values()) {
      discordAttachments.push(attachment);
    }

    if (discordAttachments.length) {
      logger.info({ discordAttachments }, "Uploading attachments...");
    }

    const attachments = await Promise.all(
      discordAttachments.map(async ({ name, url }) => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`${response.statusText}: ${response.status}`);
        }

        if (response.body === null) {
          throw new Error("No response body");
        }

        const attachmentUrl = await uploadAttachment({ messageUUID, name, body: Readable.from(response.body) });

        return {
          name,
          url: attachmentUrl,
        };
      }),
    );

    logger.info("Creating message in dynamo...");

    await activityMessageEntity
      .build(PutItemCommand)
      .item({
        uuid: messageUUID,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        activityName,
        content: message.content,
        attachments,
      })
      .send();

    logger.info("Saved message!");

    await interaction.update({
      content: `The message will be sent in this channel whenever you start \`${activityName}\`.`,
      components: [],
    });
  }
};

const handleAutocomplete = async (interaction: AutocompleteInteraction, logger: pino.Logger) => {
  const focusedValue = interaction.options.getFocused();

  logger.info("Getting autocomplete suggestions...");

  let suggestions = await getAutocompleteSuggestions(interaction, focusedValue);

  logger.info(suggestions, "Got autocomplete suggestions");

  await interaction.respond(suggestions);
};

const getAutocompleteSuggestions = async (
  interaction: AutocompleteInteraction,
  focusedValue: string,
): Promise<ApplicationCommandOptionChoiceData<string | number>[]> => {
  if (interaction.commandName === "list-messages" && interaction.guildId) {
    return (await queryActivityMessages({ userId: interaction.user.id, guildId: interaction.guildId }))
      .filter(
        ({ activityName, channelId }) =>
          channelId === interaction.channelId && // ensure this lists messages in the channel
          activityName.startsWith(focusedValue), // ensure the name of the activity starts with what's in the input,
      )
      .map(({ activityName }) => ({ name: activityName, value: activityName }));
  }

  return [];
};
