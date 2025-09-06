import { queryActivityMessages } from "../lib/dynamo";
import { buildCommandSpec } from "./types";
import assert from "assert";
import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import _ from "lodash";

const command = buildCommandSpec("slash", {
  builder: new SlashCommandBuilder()
    .setName("list-messages")
    .setDescription("List messages you have registered to send here when you start a specific activity")
    .addStringOption((option) =>
      option.setName("activity").setDescription("Activity to filter by").setRequired(false).setAutocomplete(true),
    ),
  handler: async (interaction) => {
    assert(interaction.guildId);
    assert(interaction.channel?.isSendable());

    const activityName = interaction.options.getString("activity", false) ?? undefined;

    const activityMessages = await queryActivityMessages({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      activityName,
    });

    const activityMessageByActivityName = Object.entries(
      _.groupBy(activityMessages, ({ activityName }) => activityName),
    ).toSorted();

    const files = activityMessageByActivityName.flatMap(([, messages]) =>
      messages.flatMap(({ uuid, attachments }) =>
        attachments.map(({ name, url }) => new AttachmentBuilder(url).setName(`${uuid}-${name}`)),
      ),
    );

    const components = activityMessageByActivityName.flatMap(([activityName, messages], index) => [
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(false),
      new SectionBuilder()
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`## ${activityName}`))
        .setButtonAccessory(
          new ButtonBuilder().setCustomId("foo2").setLabel("Delete all").setStyle(ButtonStyle.Danger),
        ),
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
      ...[
        ...messages.map(({ uuid, created, content, attachments }) =>
          new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  (textDisplay) => textDisplay.setContent(`\`${uuid}\``),
                  (textDisplay) =>
                    textDisplay.setContent(`-# Registered <t:${Math.floor(new Date(created).getTime() / 1000)}:f>`),
                )
                .setButtonAccessory(
                  new ButtonBuilder().setCustomId("foo").setLabel("Delete").setStyle(ButtonStyle.Danger),
                ),
            )
            .addSeparatorComponents((seperator) => seperator.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
            .addTextDisplayComponents((textDisplay) => textDisplay.setContent(content))
            .addFileComponents(
              ...attachments.map(({ name }) => new FileBuilder().setURL(`attachment://${uuid}-${name}`)),
            ),
        ),
        ...(index < activityMessageByActivityName.length - 1
          ? [new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)]
          : []),
      ],
    ]);

    console.log(components);

    await interaction.reply({
      components,
      files,
      flags: MessageFlags.IsComponentsV2,
    });
  },
});

export default command;
