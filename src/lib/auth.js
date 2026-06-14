import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

// Roles are stored on the Supabase user's metadata (app_metadata.role),
// set when you create the user. Admin = you. Client = a customer.
// A client's email is matched to a row in `clients` to resolve which
// projects they may see (the database enforces this via RLS; the role here
// only decides which UI to render).
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const role = session?.user?.app_metadata?.role
    || session?.user?.user_metadata?.role
    || (session ? "client" : null); // default a logged-in user to client unless marked admin

  return {
    loading,
    session,
    user: session?.user || null,
    role,
    isAdmin: role === "admin",
    signOut: () => supabase.auth.signOut(),
  };
}
