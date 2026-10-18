import { limitApiRequest } from "./lib/api-rate-limit";

export function middleware(request: Request) {
  return limitApiRequest(request);
}

export const config = { matcher: "/api/:path*" };
