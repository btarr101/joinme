import { queryActivityMessages, writeRecordedActivites } from "./lib/dynamo";
import logger from "./lib/logger";
import assert from "assert";
import { Presence } from "discord.js";

export const handlePresenceUpdate = async (oldPresence: Presence | null, newPresence: Presence) => {
  if (!newPresence) return;
  const userId = newPresence.userId;

  const oldActivities = oldPresence?.activities ?? [];
  const newActivities = newPresence.activities
    .filter(({ name }) => name !== "Custom Status") // Filter out discord custom status
    .filter((activity) => !oldActivities.some(({ name }) => name === activity.name));

  if (!newActivities.length) return;

  logger.info(newPresence, "Received prescense update!");

  await writeRecordedActivites(newActivities.map(({ name }) => ({ userId, activityName: name })));

  const guild = newPresence.guild;
  if (!guild) {
    logger.warn("Guild not included in presence update");
    return;
  }

  const messagesToSend = (
    await Promise.all(
      newActivities.map(async ({ name }) => {
        const messages = await queryActivityMessages({
          userId,
          guildId: guild.id,
          activityName: name,
        });

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
      assert(channel?.isSendable());

      const files = message.attachments.length
        ? message.attachments.map(({ url, name }) => ({
            attachment: url,
            name,
          }))
        : undefined;

      await channel.send({ content: message.content, files });
    }),
  );

  logger.info("Sent messages");
};
