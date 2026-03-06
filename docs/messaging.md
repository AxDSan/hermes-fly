# Messaging Setup

hermes-fly supports optional notifications via Telegram and Discord. The deploy
wizard prompts for messaging setup, or configure it later by rerunning
`hermes-fly deploy`.

## Telegram

### 1. Create a Bot via @BotFather

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Follow the prompts to choose a name and username for your bot.
4. BotFather replies with a **bot token** in the format:

   ```text
   123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
   ```

5. Save this token. You will enter it during the deploy wizard.

### 2. Find Your User ID

Your Telegram user ID is a numeric identifier (not your username). To find it:

1. Search for `@userinfobot` on Telegram.
2. Send it any message.
3. It replies with your user ID (a number like `123456789`).

Alternatively, forward a message from yourself to `@userinfobot`.

### 3. Find a Group Chat ID

If you want notifications sent to a group:

1. Add your bot to the group.
2. Send a message in the group.
3. Open this URL in a browser (replace `YOUR_BOT_TOKEN`):

   ```text
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```

4. Look for `"chat":{"id":-100XXXXXXXXXX}` in the response. The negative
   number is your group chat ID.

### 4. Enter Credentials in the Wizard

When prompted during deployment:

- **Bot token** -- paste the token from BotFather
- **Allowed user IDs** -- paste a comma-separated list of Telegram user IDs permitted to interact with the bot

The token is stored via `fly secrets set` and never written to disk.

## Discord

### 1. Create an Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click "New Application" and give it a name.
3. Note the **Application ID** on the General Information page.

### 2. Create a Bot

1. In your application, go to the "Bot" section (a bot user is created automatically with your application).
2. Click "Reset Token" to reveal and generate a new token.
3. Copy the **bot token** and save it securely.

### 3. Configure Permissions

Your bot needs these permissions to send messages:

- Send Messages
- Embed Links (optional, for rich notifications)

To generate an invite URL:

1. Go to "OAuth2" > "URL Generator".
2. Under "Scopes", select `bot`.
3. Under "Bot Permissions", select `Send Messages`.
4. Copy the generated URL and open it in a browser to add the bot to your server.

### 4. Enable Intents

If your bot needs to read messages (not just send):

1. Go to "Bot" settings.
2. Enable "Message Content Intent" under Privileged Gateway Intents.

For notification-only use, this is not required.

### 5. Get the Channel ID

1. In Discord, go to User Settings > Advanced > enable "Developer Mode".
2. Right-click the channel where you want notifications.
3. Click "Copy Channel ID".

### 6. Enter Credentials in the Wizard

When prompted during deployment:

- **Bot token** -- paste the bot token from the Developer Portal
- **Allowed user IDs** -- paste a comma-separated list of Discord user IDs permitted to interact with the bot

The token is stored via `fly secrets set` and never written to disk.

## Troubleshooting

### Telegram bot not sending messages

- Verify the bot token format: digits, colon, then alphanumeric characters.
- Confirm the chat ID is correct. User IDs are positive numbers; group IDs are negative.
- Make sure the bot has been started. Send `/start` to your bot in a direct message.
- If using a group, ensure the bot has been added to the group.

### Discord bot not sending messages

- Verify the bot token is correct (reset it in the Developer Portal if unsure).
- Confirm the bot has been invited to the server with "Send Messages" permission.
- Check that the channel ID is correct (use Developer Mode to copy it).
- Ensure the bot has access to the specific channel (check channel permission overrides).

### Updating messaging credentials

Rerun `hermes-fly deploy` to reconfigure messaging, or set secrets directly:

```bash
# Telegram
fly secrets set TELEGRAM_BOT_TOKEN="your-token" -a your-app-name
fly secrets set TELEGRAM_ALLOWED_USERS="comma-separated-user-ids" -a your-app-name

# Discord
fly secrets set DISCORD_BOT_TOKEN="your-token" -a your-app-name
fly secrets set DISCORD_ALLOWED_USERS="comma-separated-user-ids" -a your-app-name
```

## References

- [Telegram Bot API - getUpdates](https://core.telegram.org/bots/api#getupdates)
- [discord.py bot account setup](https://discordpy.readthedocs.io/en/stable/discord.html)
- [Discord OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2)
