const startTokenPattern = /^[a-f0-9]{32}$/i;
const subscriptionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buttonText(prefix: string, complex: string) {
  const fullText = `${prefix}ЖК «${complex}»`;
  const encoder = new TextEncoder();
  let value = "";
  for (const character of fullText) {
    if (encoder.encode(value + character + "…").length > 64) return `${value}…`;
    value += character;
  }
  return value;
}

export function isTelegramStartToken(token: string) {
  return startTokenPattern.test(token);
}

export function telegramDeepLink(username: string, token: string) {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username) || !isTelegramStartToken(token)) return null;
  return `https://t.me/${username}?start=${token}`;
}

export function telegramStartToken(text: unknown) {
  if (typeof text !== "string") return null;
  const match = /^\/start(?:@[A-Za-z0-9_]{5,32})?\s+([a-f0-9]{32})\s*$/i.exec(text);
  return match ? match[1]!.toLowerCase() : null;
}

export function telegramUnsubscribeCallbackData(subscriptionId: string) {
  return subscriptionIdPattern.test(subscriptionId) ? `complex-unsubscribe:${subscriptionId}` : null;
}

export function telegramUnsubscribeSubscriptionId(data: unknown) {
  if (typeof data !== "string") return null;
  const unsubscribe = /^complex-unsubscribe:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(data);
  return unsubscribe ? unsubscribe[1]!.toLowerCase() : null;
}

export function telegramUnsubscribeButtonText(complex: string) {
  return buttonText("Отписаться: ", complex);
}
