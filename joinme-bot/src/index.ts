import { handleClientReady } from "./handle-client-ready";
import { handleInteraction } from "./handle-interaction-create";
import { handlePresenceUpdate } from "./handle-presence-update";
import env from "./lib/env";
import { Events } from "discord.js";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences] });

client.once(Events.ClientReady, handleClientReady);
client.on(Events.InteractionCreate, handleInteraction);
client.on(Events.PresenceUpdate, handlePresenceUpdate);

client.login(env.DISCORD_TOKEN);
