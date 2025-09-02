import {
  ChatInputCommandInteraction,
  CommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import pino from "pino";

type BaseCommandHandler<TInteraction extends CommandInteraction> = (
  interaction: TInteraction,
  logger: pino.Logger,
) => Promise<any>;

type CommandSpecMap = {
  slash: {
    builder: SlashCommandBuilder;
    interaction: ChatInputCommandInteraction;
  };
  messageContextMenu: {
    builder: ContextMenuCommandBuilder;
    interaction: MessageContextMenuCommandInteraction;
  };
};

export type CommandType = keyof CommandSpecMap;

export type CommandBuilder<TCommandType extends CommandType = CommandType> = CommandSpecMap[TCommandType]["builder"];

export type CommandInteractionByType<TCommandType extends CommandType = CommandType> =
  CommandSpecMap[TCommandType]["interaction"];

export type CommandHandler<TCommandType extends CommandType = CommandType> = BaseCommandHandler<
  CommandInteractionByType<TCommandType>
>;

export type CommandSpec<TCommandType extends CommandType = CommandType> = {
  ty: TCommandType;
  builder: CommandBuilder<TCommandType>;
  handler: CommandHandler<TCommandType>;
};

export type AnyCommandSpec = CommandSpec<"messageContextMenu"> | CommandSpec<"slash">;

export type BuildCommandSpecParams<TCommandType extends CommandType> = {
  builder: CommandBuilder<TCommandType>;
  handler: CommandHandler<TCommandType>;
};

export const buildCommandSpec = <TCommandType extends CommandType>(
  ty: TCommandType,
  params: BuildCommandSpecParams<TCommandType>,
) => ({
  ty,
  ...params,
});
