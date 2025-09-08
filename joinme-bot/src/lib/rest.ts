import env from "./env";
import { REST } from "discord.js";

export default new REST().setToken(env.DISCORD_TOKEN);
