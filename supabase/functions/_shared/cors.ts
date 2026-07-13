// Shared CORS headers for all edge functions.
//
// The two webhooks (razorpay-webhook, shiprocket-webhook) are server-to-server
// calls with no browser Origin, so they keep the permissive static headers
// below. The three browser-invoked authed functions (create-razorpay-order,
// send-email, shiprocket-create-order) should call corsHeadersFor(req) so the
// Access-Control-Allow-Origin reflects only an allowlisted Origin.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ORIGINS = new Set([
  "https://zarketplace.com",
  "https://www.zarketplace.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5199",
  "http://127.0.0.1:5199",
]);

// Build CORS headers that reflect the request Origin only when it is on the
// allowlist. Unknown origins get no Access-Control-Allow-Origin header, so the
// browser blocks the cross-origin response. Bearer-token (verify_jwt) auth is
// unaffected; this only governs which web origins may read the response.
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
