import { serve } from "https://deno.land/std/http/server.ts";

serve(async () => {
  const APP_ID = Deno.env.get("CASHFREE_APP_ID");
  const SECRET = Deno.env.get("CASHFREE_SECRET_KEY");

  const res = await fetch("https://api.cashfree.com/pg/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "2022-09-01",
      "x-client-id": APP_ID!,
      "x-client-secret": SECRET!,
    },
    body: JSON.stringify({
      order_amount: 100,
      order_currency: "INR",
      order_id: "order_" + Date.now(),
      customer_details: {
        customer_id: "user_1",
        customer_email: "test@test.com",
        customer_phone: "9999999999",
      },
    }),
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});