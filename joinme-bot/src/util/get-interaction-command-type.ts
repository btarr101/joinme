import { CommandInteractionByType, CommandType } from "../commands/types";
import { Interaction } from "discord.js";

export type ExtractInteractionCommandResult<TCommandType extends CommandType = CommandType> = {
  ty: TCommandType;
  interaction: CommandInteractionByType<TCommandType>;
};

const asCommandResult = <TCommandType extends CommandType>(
  ty: TCommandType,
  interaction: CommandInteractionByType<TCommandType>,
): ExtractInteractionCommandResult<TCommandType> => ({
  ty,
  interaction,
});

export const extractInteractionCommand = (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) return asCommandResult("slash", interaction);
  if (interaction.isMessageContextMenuCommand()) return asCommandResult("messageContextMenu", interaction);

  return { ty: null, interaction: undefined };
};
