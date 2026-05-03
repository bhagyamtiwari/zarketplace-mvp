// Shared CORS headers for Supabase Edge Functions.
// Allow public POST from the frontend during MVP. Tighten origin for prod.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
