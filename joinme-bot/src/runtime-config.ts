import logger from "./lib/logger";
import arg from "arg";

export type RuntimeConfig = {
  registerCommands: boolean;
};

const commandLineArgs = arg(
  {
    "--register-commands": Boolean,
    "-r": "--register-commands",
  },
  {
    permissive: true,
  },
);

const config: RuntimeConfig = {
  registerCommands: commandLineArgs["--register-commands"] ?? false,
};

logger.info({ config }, "Loaded runtime config");

export default config;
