import { hasValidAdminSession } from "./admin-auth";
import { isSameOriginRequest } from "./session";

export async function authorizeAdminRequest(request: Request, mutation = false) {
  return (!mutation || isSameOriginRequest(request)) && hasValidAdminSession(request);
}
