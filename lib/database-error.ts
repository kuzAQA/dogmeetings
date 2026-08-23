export function databaseErrorMessage(error: unknown, fallback: string, missingTableMessage?: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ECONNREFUSED") || message.includes("connect")) {
    return "Не удалось подключиться к PostgreSQL.";
  }
  if (missingTableMessage && message.includes("does not exist")) return missingTableMessage;
  return fallback;
}
