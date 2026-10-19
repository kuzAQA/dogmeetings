import { cookies, headers } from "next/headers";
import Home from "./Home";
import { isAnnouncementPreviewEnabled } from "../lib/announcement-preview";

export default async function Page() {
  const requestCookies = await cookies();
  const requestHeaders = await headers();
  return <Home hasSessionCookie={requestCookies.has("dogmeet_session")} announcementPreviewEnabled={isAnnouncementPreviewEnabled(requestHeaders.get("host"))} />;
}
