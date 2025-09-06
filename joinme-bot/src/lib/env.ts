import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string(),
  TABLE_NAME: z.string(),
  BUCKET_NAME: z.string(),
  BUCKET_REGION: z.literal("us-west-1"),
  NODE_ENV: z.enum(["production", "development"]).default("development"),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // using console.error here because logger requires environment variables to initialize
  console.error("⚠️ Environment issues!", result.error.issues);
  process.exit(1);
}

export default result.data;
