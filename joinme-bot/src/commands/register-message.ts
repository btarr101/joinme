import { queryRecordedActivities, writeInteractionToken } from "../lib/dynamo";
import { buildCommandSpec } from "./types";
import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  ContextMenuCommandBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";

const command = buildCommandSpec("messageContextMenu", {
  builder: new ContextMenuCommandBuilder().setName("Register Message").setType(ApplicationCommandType.Message),
  handler: async (interaction) => {
    const userId = interaction.user.id;
    const messageId = interaction.targetMessage.id;

    const components: any[] = [
      new TextDisplayBuilder().setContent(
        "Choose the activity you want to register this message for (the message will be sent whenever you start that activity).",
      ),
      new SeparatorBuilder().setDivider(false),
    ];

    const activityOptions = await queryRecordedActivities({ userId });
    if (activityOptions.length) {
      const select = new StringSelectMenuBuilder()
        .setCustomId("select-activity")
        .setPlaceholder("Select an activity")
        .setMaxValues(1)
        .addOptions(
          activityOptions.map(({ activityName }) =>
            new StringSelectMenuOptionBuilder().setLabel(activityName).setValue(
              JSON.stringify({
                messageId,
                activityName,
              }),
            ),
          ),
        );

      components.push(
        new ActionRowBuilder().addComponents(select),
        new SeparatorBuilder().setDivider(false),
        new TextDisplayBuilder().setContent("Or..."),
        new SeparatorBuilder().setDivider(false),
      );
    }

    const uuid = randomUUID();
    await writeInteractionToken({
      uuid,
      token: interaction.token,
      expiresAt: Math.floor(Date.now() / 1000 + 20 * 60),
    });

    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`OPENMODAL#${messageId}#${uuid}`)
          .setLabel("Enter the raw activity name")
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    await interaction.reply({
      components,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },
});

export default command;
