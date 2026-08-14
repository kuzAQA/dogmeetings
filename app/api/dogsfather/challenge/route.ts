import { createAdminLoginChallenge } from "../../../../lib/admin-auth";
import { privateJson } from "../../../../lib/session";

export async function GET(request: Request) {
  try {
    const challenge = await createAdminLoginChallenge(request);
    return privateJson({
      challenge: challenge.challenge,
      iterations: challenge.iterations,
      salt: challenge.salt
    }, {}, challenge.cookie);
  } catch {
    return privateJson({ error: "Вход администратора не настроен." }, { status: 500 });
  }
}
