import { cookies } from "next/headers";
import Home from "./Home";

export default async function Page() {
  const requestCookies = await cookies();
  return <Home hasSessionCookie={requestCookies.has("dogmeet_session")} />;
}
