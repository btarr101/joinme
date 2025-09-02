import { recordedActivity, table } from "../lib/dynamo";
import { buildCommandSpec } from "./types";
import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { QueryCommand } from "dynamodb-toolbox";

const command = buildCommandSpec("messageContextMenu", {
  builder: new ContextMenuCommandBuilder().setName("Register Message").setType(ApplicationCommandType.Message),
  handler: async (interaction) => {
    const userId = interaction.user.id;
    const messageId = interaction.targetMessage.id;

    const activityOptionsQuery = await table
      .build(QueryCommand)
      .entities(recordedActivity)
      .query({
        partition: `USER#${userId}`,
        range: {
          beginsWith: "RECORDED_ACTIVITY",
        },
      })
      .send();

    const activityOptions = activityOptionsQuery.Items ?? [];

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

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      content:
        "Choose the activity you want to register this message for (the message will be sent whenever you start that activity).",
      // @ts-ignore
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
});

export default command;
