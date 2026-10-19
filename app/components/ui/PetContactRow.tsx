import { contactHref, formatPhoneContact, type ContactType } from "../../../lib/pet-contact";

export function PetContactRow({ contact, type, example = false }: { contact: string; type?: ContactType | null; example?: boolean }) {
  const href = example ? undefined : contactHref(type, contact);
  const value = type === "phone" ? formatPhoneContact(contact) : contact;
  return <div className="pet-contact-row"><dt>Контакт</dt><dd>{href
    ? <a className="pet-contact-value" href={href}>{value}</a>
    : <span className={example ? "pet-contact-value" : undefined}>{value}</span>}</dd></div>;
}
