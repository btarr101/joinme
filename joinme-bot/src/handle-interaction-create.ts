import { commandHandlers } from "./commands";
import { CommandInteractionByType, CommandType } from "./commands/types";
import { activityMessageEntity, deleteActivityMessage, getActivityMessage, queryActivityMessages } from "./lib/dynamo";
import logger from "./lib/logger";
import { uploadAttachment } from "./lib/s3";
import { extractInteractionCommand } from "./util/extract-interaction-command";
import assert from "assert";
import { randomUUID } from "crypto";
import {
  ApplicationCommandOptionChoiceData,
  Attachment,
  AutocompleteFocusedOption,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  Interaction,
  MessageFlags,
  StringSelectMenuInteraction,
} from "discord.js";
import { PutItemCommand } from "dynamodb-toolbox";
import _ from "lodash";
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

    if (interaction.isButton()) return await handleButton(interaction, interactionLogger);

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

    const discordAttachments: Attachment[] = [];
    for (const attachment of message.attachments.values()) {
      discordAttachments.push(attachment);
    }

    if (discordAttachments.length) {
      logger.info({ discordAttachments }, "Uploading attachments...");
    }

    const messageUUID = randomUUID();

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
      content: `✅ The message will be sent in this channel whenever you start \`${activityName}\`.`,
      components: [],
    });
  }
};

const handleAutocomplete = async (interaction: AutocompleteInteraction, logger: pino.Logger) => {
  const focused = interaction.options.getFocused(true);

  logger.info("Getting autocomplete suggestions...");

  let suggestions = await getAutocompleteSuggestions(interaction, focused);

  logger.info(suggestions, "Got autocomplete suggestions");

  await interaction.respond(suggestions);
};

const getAutocompleteSuggestions = async (
  interaction: AutocompleteInteraction,
  focused: AutocompleteFocusedOption,
): Promise<ApplicationCommandOptionChoiceData<string | number>[]> => {
  if (focused.name === "activity") {
    assert(interaction.guildId);

    const lowerCaseFocusedValue = focused.value.toLocaleLowerCase();

    const uniqueActivities = _.uniq(
      (await queryActivityMessages({ userId: interaction.user.id, guildId: interaction.guildId }))
        .filter(
          ({ channelId }) => channelId === interaction.channelId, // ensure this lists messages in the channel
        )
        .map(({ activityName }) => activityName),
    )
      .filter((activityName) => activityName.toLocaleLowerCase().startsWith(lowerCaseFocusedValue))
      .toSorted();

    return uniqueActivities.map((activityName) => ({ name: activityName, value: activityName }));
  }

  return [];
};

const handleButton = async (interaction: ButtonInteraction, logger: pino.Logger) => {
  const [buttonAction, ...actionParams] = interaction.customId.split("#");
  assert(buttonAction);

  logger.info({ buttonAction, actionParams }, "Handling button interaction");

  switch (buttonAction) {
    case "PREVIEW":
      return await handlePreview(interaction, actionParams, logger);

    case "DELETE":
      return await handleDelete(interaction, actionParams, logger);
  }
};

const handlePreview = async (interaction: ButtonInteraction, actionParams: string[], logger: pino.Logger) => {
  const [userId, guildId, activityName] = actionParams;
  assert(userId);
  assert(guildId);
  assert(activityName);

  const message = await getActivityMessage({ userId, guildId, activityName });
  assert(message);

  logger.info({ message }, "Sending message");

  const files = message.attachments.length
    ? message.attachments.map(({ url, name }) => ({
        attachment: url,
        name,
      }))
    : undefined;

  await interaction.reply({ content: message.content, files, flags: MessageFlags.Ephemeral });

  logger.info("Sent message");
};

const handleDelete = async (interaction: ButtonInteraction, actionParams: string[], logger: pino.Logger) => {
  const [userId, guildId, activityName] = actionParams;
  assert(userId);
  assert(guildId);
  assert(activityName);

  logger.info({ userId, guildId, activityName }, "Deleting activity message");

  await deleteActivityMessage({ userId, guildId, activityName });

  logger.info("Deleted activity message");

  await interaction.update({
    components: [
      new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`## ${activityName}`))
        .addActionRowComponents((actionRow) =>
          actionRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`DELETED#${userId}#${guildId}#${activityName}`)
              .setLabel("Deleted")
              .setDisabled()
              .setStyle(ButtonStyle.Danger),
          ),
        ),
    ],
  });
};
