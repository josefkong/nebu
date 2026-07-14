// ============================================================================
// Nebu — portal-access Edge Function
// Admin-only utilities that need auth-admin privileges (impossible from the
// browser by design):
//   { action: "check", emails: [...] }  -> which emails have a portal login
//   { action: "invite", email }         -> create the auth user + send the
//                                          branded invitation (via your SMTP)
//
// Security: requires a valid logged-in JWT AND app_metadata.role === "admin".
// Uses the service-role key, which Supabase injects into Edge Functions
// automatically — it never exists in the app.
//
// Deploy with:  supabase functions deploy portal-access
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Missing Supabase environment");

    const admin = createClient(url, serviceKey);

    // ---- Gate: caller must be a logged-in admin ----
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || userData?.user?.app_metadata?.role !== "admin") {
      return json({ error: "Admin only" }, 403);
    }

    const { action, email, emails } = await req.json();

    if (action === "check") {
      // Small project: listing all users is fine (paginated far above real size).
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json({ error: error.message }, 500);
      const existing = new Set((data?.users || []).map((u) => String(u.email || "").toLowerCase()));
      const users: Record<string, boolean> = {};
      for (const e of (emails || [])) users[e] = existing.has(String(e).toLowerCase());
      return json({ users });
    }

    if (action === "invite") {
      if (!email) return json({ error: "Missing email" }, 400);
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://nebuspace.com.br",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
