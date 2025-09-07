import { queryActivityMessages } from "../lib/dynamo";
import { buildCommandSpec } from "./types";
import assert from "assert";
import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  SlashCommandBuilder,
} from "discord.js";
import _ from "lodash";

const command = buildCommandSpec("slash", {
  builder: new SlashCommandBuilder()
    .setName("list-messages")
    .setDescription("List messages you have registered to send here when you start a specific activity"),
  handler: async (interaction) => {
    assert(interaction.guildId);
    assert(interaction.channel?.isSendable());

    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    const activityMessages = await queryActivityMessages({
      userId,
      guildId,
      channelId,
    });

    if (!activityMessages.length) {
      await interaction.reply({
        content: "❌ No messages registerd in this channel.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const followUpMessages = activityMessages.map(({ activityName, modified }) => ({
      components: [
        new ContainerBuilder()
          .addTextDisplayComponents(
            (textDisplay) => textDisplay.setContent(`## ${activityName}`),
            (textDisplay) =>
              textDisplay.setContent(`-# Registered <t:${Math.floor(new Date(modified).getTime() / 1000)}:f>`),
          )
          .addSeparatorComponents((seperator) => seperator.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
          .addActionRowComponents((actionRow) =>
            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`PREVIEW#${guildId}#${userId}#${activityName}#${channelId}`)
                .setLabel("Preview")
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`DELETE#${guildId}#${userId}#${activityName}#${channelId}`)
                .setLabel("Delete")
                .setStyle(ButtonStyle.Danger),
            ),
          ),
      ],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    }));

    await interaction.reply({
      content: "📝 Listing messages...",
      flags: MessageFlags.Ephemeral,
    });

    for (const followupMessage of followUpMessages) {
      await interaction.channel.sendTyping();

      await interaction.followUp(followupMessage);
    }
  },
});

export default command;
