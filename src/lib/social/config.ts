// Which channels the daily post goes to, and whether their settings are good. A channel is on only when ALL of its
// settings are present and well-formed; a half-set channel is reported, never silently skipped. Messages name the
// setting to fix and never repeat a value, because every one of these is a secret.
export type Channel = 'telegram' | 'bluesky' | 'discord';

export type ChannelConfig =
  | { channel: 'telegram'; token: string; chatId: string }
  | { channel: 'bluesky'; handle: string; appPassword: string }
  | { channel: 'discord'; webhookUrl: string };

const TELEGRAM_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const TELEGRAM_CHAT = /^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
const BLUESKY_HANDLE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const BLUESKY_APP_PASSWORD = /^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/i;
const DISCORD_WEBHOOK = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;

const get = (env: Record<string, string | undefined>, name: string) => (env[name] ?? '').trim();

export function loadSocialConfig(env: Record<string, string | undefined>): { channels: ChannelConfig[]; problems: string[] } {
  const channels: ChannelConfig[] = [];
  const problems: string[] = [];

  const token = get(env, 'TELEGRAM_BOT_TOKEN');
  const chatId = get(env, 'TELEGRAM_CHAT_ID');
  if (token || chatId) {
    if (!token || !chatId) problems.push(`Telegram needs both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (missing ${token ? 'TELEGRAM_CHAT_ID' : 'TELEGRAM_BOT_TOKEN'}).`);
    else if (!TELEGRAM_TOKEN.test(token)) problems.push('TELEGRAM_BOT_TOKEN does not look like a Telegram bot token (it comes from @BotFather).');
    else if (!TELEGRAM_CHAT.test(chatId)) problems.push('TELEGRAM_CHAT_ID must be a channel like @yourchannel, or a numeric chat id.');
    else channels.push({ channel: 'telegram', token, chatId });
  }

  const handle = get(env, 'BLUESKY_HANDLE');
  const appPassword = get(env, 'BLUESKY_APP_PASSWORD');
  if (handle || appPassword) {
    if (!handle || !appPassword) problems.push(`Bluesky needs both BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (missing ${handle ? 'BLUESKY_APP_PASSWORD' : 'BLUESKY_HANDLE'}).`);
    else if (!BLUESKY_HANDLE.test(handle)) problems.push('BLUESKY_HANDLE should look like yourname.bsky.social (without the @).');
    else if (!BLUESKY_APP_PASSWORD.test(appPassword)) problems.push('BLUESKY_APP_PASSWORD must be an app password (like xxxx-xxxx-xxxx-xxxx) made in Bluesky Settings, never your main password.');
    else channels.push({ channel: 'bluesky', handle, appPassword });
  }

  const webhookUrl = get(env, 'DISCORD_WEBHOOK_URL');
  if (webhookUrl) {
    if (!DISCORD_WEBHOOK.test(webhookUrl)) problems.push('DISCORD_WEBHOOK_URL does not look like a Discord webhook address (https://discord.com/api/webhooks/...).');
    else channels.push({ channel: 'discord', webhookUrl });
  }

  return { channels, problems };
}
