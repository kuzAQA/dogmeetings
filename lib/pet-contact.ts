export type ContactType = "phone" | "telegram" | "other";

export function formatPhoneContact(value: string) {
  let digits = value.replace(/\D/g, "");
  if (value.startsWith("+7") || (digits.length === 11 && /^[78]/.test(digits))) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return value ? "+7" : "";
  return "+7 (" + digits.slice(0, 3)
    + (digits.length >= 3 ? ")" : "")
    + (digits.length > 3 ? " " + digits.slice(3, 6) : "")
    + (digits.length > 6 ? " " + digits.slice(6, 8) : "")
    + (digits.length > 8 ? "-" + digits.slice(8) : "");
}

export function normalizeContact(type: ContactType, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (type === "phone") return "+" + formatPhoneContact(trimmed).replace(/\D/g, "");
  if (type === "telegram") return "@" + trimmed.replace(/^@+/, "");
  return trimmed;
}

export function contactError(type: string, value: string) {
  if (type !== "phone" && type !== "telegram" && type !== "other") return "Выберите тип контакта.";
  if (!value.trim()) return "";
  if (value.trim().length > 120) return "Контакт должен быть не длиннее 120 символов.";
  if (type === "phone" && (!/^[+\d\s()-]+$/.test(value) || !/^(?:[78])?\d{10}$/.test(value.replace(/\D/g, "")))) return "Введите телефон полностью: +7 (911) 123 31-11.";
  if (type === "telegram" && !/^@[a-zA-Z0-9_]{1,32}$/.test(normalizeContact(type, value))) return "Используйте имя Telegram до 32 символов: латинские буквы, цифры и _.";
  return "";
}

export function contactHref(type: ContactType | null | undefined, value: string) {
  if (!type || !value || contactError(type, value)) return undefined;
  if (type === "phone") return "tel:" + normalizeContact(type, value);
  if (type === "telegram") return "https://t.me/" + normalizeContact(type, value).slice(1);
  return undefined;
}
