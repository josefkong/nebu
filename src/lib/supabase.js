import { createClient } from "@supabase/supabase-js";

// These come from your .env file (see .env.example and the README).
// VITE_ prefix is required for Vite to expose them to the browser.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced loudly so a misconfigured deploy fails clearly instead of silently.
  console.error(
    "Missing Supabase env vars. Copy .env.example to .env and fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(url || "http://localhost", anonKey || "public-anon-key");
