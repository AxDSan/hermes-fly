export const TELEGRAM_BOTFATHER_URL = "https://t.me/BotFather";
export const TELEGRAM_BOTFATHER_NEWBOT_URL = `${TELEGRAM_BOTFATHER_URL}?text=${encodeURIComponent("/newbot")}`;
export const TELEGRAM_BOTFATHER_DELETEBOT_URL = `${TELEGRAM_BOTFATHER_URL}?text=${encodeURIComponent("/deletebot")}`;
export const TELEGRAM_USERINFOBOT_URL = "https://t.me/userinfobot";

export function telegramBotLink(username: string): string {
  const normalized = username.trim().replace(/^@+/, "");
  return `https://t.me/${normalized}`;
}
