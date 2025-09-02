import logger from "../lib/logger";
import ping from "./ping";
import registerMessage from "./register-message";
import { AnyCommandSpec, CommandBuilder, CommandHandler, CommandSpec, CommandType } from "./types";

const commandSpecs = [ping, registerMessage] satisfies AnyCommandSpec[];

export type CommandHandlers = {
  [TCommandType in CommandType]?: Record<string, CommandHandler<TCommandType>>;
};

export const commandBuilders: CommandBuilder[] = [];
export const commandHandlers: CommandHandlers = {};

for (const { ty, builder, handler } of commandSpecs) {
  if (!commandHandlers[ty]) {
    commandHandlers[ty] = {};
  }

  const typedCommandHandlers = commandHandlers[ty];
  const commandName = builder.name;
  if (typedCommandHandlers[commandName]) {
    logger.error(`⚠️ Invalid configuration, command name '${commandName}' is not unique!`);
    process.exit(1);
  }

  typedCommandHandlers[commandName] = handler;
  commandBuilders.push(builder);
}
