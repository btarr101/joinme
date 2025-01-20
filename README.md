# Joinme

Discord bot to send alert messages when you start an activity.

# Setup

## Shuttle

Shuttle is used for deploying and running locally. Thus to run this application you must first have the shuttle CLI installed: https://docs.shuttle.dev/getting-started/installation

You will also need Docker: https://www.docker.com/products/docker-desktop/

Next, configure required secrets. A template can be found in the root: `Secrets.dev.example.toml` (should probably make grafana not required at some point).

Then simply

```
shuttle run
```

And a postgres image will be pulled locally and then spun up to act as a databse.

## DB

This application uses sqlx to compile time check database queries. This means it needs an active connection for compile time checks when editing SQL queries. To do so you will need to copy the `DATABASE_URL` of the postgres docker image into a `.env` file similar to `.env.example`.

For a further reference on sqlx, visit https://github.com/launchbadge/sqlx

## Bot client

To get started log in to the [Discord developer portal](https://discord.com/developers/applications).

1. Click the New Application button, name your application and click Create.
2. Navigate to the Bot tab in the lefthand menu, and add a new bot.
3. On the bot page click the Reset Token button to reveal your token. Put this token in your `Secrets.toml`. It's very important that you don't reveal your token to anyone, as it can be abused.
4. For the sake of this example, you also need to scroll down on the bot page to the Message Content Intent section and enable that option.

To add the bot to a server we need to create an invite link.

1. On your bot's application page, open the OAuth2 page via the lefthand panel.
2. Go to the URL Generator via the lefthand panel, and select the `bot` scope as well as the `Send Messages` permission in the Bot Permissions section.
3. Copy the URL, open it in your browser and select a Discord server you wish to invite the bot to.

For more information please refer to the [Discord docs](https://discord.com/developers/docs/getting-started) as well as the [Poise docs](https://docs.rs/poise) for more examples.

# Monitoring

This application is set up to forward logs to Grafana Loki https://grafana.com/oss/loki/.
