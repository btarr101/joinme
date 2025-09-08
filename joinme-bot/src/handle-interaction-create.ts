import { commandHandlers } from "./commands";
import { CommandInteractionByType, CommandType } from "./commands/types";
import {
  activityMessageEntity,
  deleteActivityMessage,
  getActivityMessage,
  getInteractionToken,
  queryActivityMessages,
} from "./lib/dynamo";
import logger from "./lib/logger";
import rest from "./lib/rest";
import { uploadAttachment } from "./lib/s3";
import { extractInteractionCommand } from "./util/extract-interaction-command";
import assert from "assert";
import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ApplicationCommandOptionChoiceData,
  Attachment,
  AutocompleteFocusedOption,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ComponentType,
  Interaction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  Routes,
  StringSelectMenuInteraction,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
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

    if (interaction.isModalSubmit()) return await handleModalSubmit(interaction, interactionLogger);

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
    assert(message);

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
      components: [
        new TextDisplayBuilder().setContent(
          `✅ The message will be sent in this channel whenever you start \`${activityName}\`.`,
        ),
      ],
    });

    return;
  }
};

const handleModalSubmit = async (interaction: ModalSubmitInteraction, logger: pino.Logger) => {
  if (interaction.customId.startsWith("enter-raw-activity-modal")) {
    assert(interaction.guildId);
    assert(interaction.channelId);

    const [_, messageId, interactionTokenUUID] = interaction.customId.split("#");
    assert(messageId);
    assert(interactionTokenUUID);

    const activityName = interaction.fields.getTextInputValue("raw-activity-name");
    assert(activityName);

    const message = await interaction.channel?.messages.fetch(messageId);
    assert(message);

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

    const interactionToken = await getInteractionToken(interactionTokenUUID);
    if (interactionToken?.token) {
      await rest.patch(Routes.webhookMessage(interaction.applicationId, interactionToken.token), {
        body: {
          components: [
            new TextDisplayBuilder()
              .setContent(`✅ The message will be sent in this channel whenever you start \`${activityName}\`.`)
              .toJSON(),
          ],
        },
      });
    }

    await interaction.deferUpdate();

    return;
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

    case "OPENMODAL":
      return await handleOpenModal(interaction, actionParams);
  }
};

const handlePreview = async (interaction: ButtonInteraction, actionParams: string[], logger: pino.Logger) => {
  const [guildId, userId, activityName, channelId] = actionParams;
  assert(guildId);
  assert(userId);
  assert(activityName);
  assert(channelId);

  const message = await getActivityMessage({ guildId, userId, activityName, channelId });
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
  const [guildId, userId, activityName, channelId] = actionParams;
  assert(guildId);
  assert(userId);
  assert(activityName);
  assert(channelId);

  logger.info({ userId, guildId, activityName }, "Deleting activity message");

  await deleteActivityMessage({ guildId, userId, activityName, channelId });

  logger.info("Deleted activity message");

  // Peak coding here
  //
  // This should be better, but it just manipulates the original component.
  for (const topLevelComponent of interaction.message.components) {
    if ("components" in topLevelComponent) {
      topLevelComponent.components.forEach((secondaryComponent, index) => {
        if (secondaryComponent.type === ComponentType.TextDisplay) {
          if (secondaryComponent.content.startsWith("## ")) {
            assert(secondaryComponent.id);

            topLevelComponent.components[index] = new TextDisplayBuilder()
              .setId(secondaryComponent.id)
              .setContent(`## ~~${activityName}~~`) as unknown as any;
          }
        } else if (secondaryComponent.type === ComponentType.ActionRow) {
          secondaryComponent.components.forEach((component, index) => {
            if (component.type === ComponentType.Button) {
              if (component.customId?.startsWith("DELETE")) {
                secondaryComponent.components[index] = ButtonBuilder.from(component)
                  .setDisabled(true)
                  .setLabel("Deleted") as unknown as any;
              } else if (component.customId?.startsWith("PREVIEW")) {
                secondaryComponent.components[index] = ButtonBuilder.from(component).setDisabled(
                  true,
                ) as unknown as any;
              }
            }
          });
        }
      });
    }
  }

  await interaction.update({
    components: interaction.message.components,
  });
};

const handleOpenModal = async (interaction: ButtonInteraction, actionParams: string[]) => {
  const [messageId, interactionTokenUUID] = actionParams;
  assert(messageId);
  assert(interactionTokenUUID);

  const textInput = new TextInputBuilder()
    .setCustomId("raw-activity-name")
    .setLabel("Raw activity name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);

  const modal = new ModalBuilder()
    .setCustomId(`enter-raw-activity-modal#${messageId}#${interactionTokenUUID}`)
    .setTitle("Register Activity Message (by raw name)")
    .addComponents(row);

  await interaction.showModal(modal);
};
