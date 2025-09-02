import { FirstArg } from "../types/util";
import env from "./env";
import pino from "pino";

const loggerConfigs = {
  development: {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  },
  production: {},
} satisfies Record<(typeof env)["NODE_ENV"], FirstArg<typeof pino>>;

const logger = pino(loggerConfigs[env.NODE_ENV]);

export default logger;
