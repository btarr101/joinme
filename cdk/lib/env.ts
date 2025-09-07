import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

const currentDirectory = process.cwd();
const relativeEnv = path.resolve(currentDirectory, ".env");
const parentEnv = path.resolve(currentDirectory, "..", ".env");

dotenv.config();
dotenv.config({
  path: [relativeEnv, parentEnv],
});

const envSchema = z.object({
  DISCORD_TOKEN: z.string(),
  ENVIRONMENT: z.enum(["production", "staging"]).default("staging"),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // using console.error here because logger requires environment variables to initialize
  console.error("⚠️ Environment issues!", result.error.issues);
  process.exit(1);
}

export default result.data;
