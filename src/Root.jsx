import { useState, useEffect } from "react";
import { useAuth } from "./lib/auth.js";
import { supabase } from "./lib/supabase.js";
import Login from "./Login.jsx";
import App from "./App.jsx";
import nebuLogo from "./assets/nebu-logo.png";

// Captured at module load, BEFORE supabase-js consumes the URL tokens.
// Invite / recovery / signup links land with a `type=` marker in the URL —
// those users have a session but never chose a password.
const ARRIVED_VIA_EMAIL_LINK =
  /type=(invite|recovery|signup)/.test(window.location.hash) ||
  /type=(invite|recovery|signup)/.test(window.location.search);

// Brand-styled "create your password" interstitial for invited users.
function SetPassword({ onDone }) {
  const C = { bg: "#0D0F13", panel: "#15181F", line: "#23272F", ink: "#ECEAE4", inkSoft: "#8B94A6", copper: "#D98A5F" };
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (pw.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message || "Could not set password."); return; }
    // Clean the token fragments out of the URL so a refresh doesn't re-trigger this.
    window.history.replaceState(null, "", window.location.pathname);
    onDone();
  };

  const input = {
    width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 9,
    border: `1px solid ${C.line}`, background: C.bg, color: C.ink, fontSize: 14,
    fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: C.panel, border: `1px solid ${C.line}`,
        borderRadius: 14, padding: "34px 30px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <img src={nebuLogo} alt="Nebu" style={{ height: 34, width: "auto", display: "block" }} />
        </div>
        <div style={{ textAlign: "center", color: C.inkSoft, fontSize: 13, marginBottom: 24 }}>
          Welcome! Create a password to finish setting up your account.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input type="password" placeholder="New password (min. 8 characters)" value={pw}
            onChange={e => setPw(e.target.value)} style={input} autoFocus />
          <input type="password" placeholder="Confirm password" value={pw2}
            onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} style={input} />
          {err && <div style={{ color: "#E2918B", fontSize: 12.5 }}>{err}</div>}
          <button onClick={submit} disabled={busy} style={{
            padding: "11px 14px", borderRadius: 9, border: "none", cursor: busy ? "default" : "pointer",
            background: C.copper, color: "#0D0F13", fontWeight: 700, fontSize: 14, fontFamily: "inherit",
            opacity: busy ? 0.7 : 1,
          }}>{busy ? "Saving…" : "Save password and continue"}</button>
        </div>
      </div>
    </div>
  );
}

// Top-level gate:
//  - not logged in                          -> Login
//  - logged in via invite/recovery link     -> SetPassword first, then the app
//  - logged in as admin                     -> full dashboard (App, mode="admin")
//  - logged in as client                    -> read-only portal (App, mode="client")
export default function Root() {
  const { loading, session, isAdmin } = useAuth();
  const [needsPassword, setNeedsPassword] = useState(ARRIVED_VIA_EMAIL_LINK);

  // Belt and braces: supabase fires PASSWORD_RECOVERY for recovery links even
  // if the URL marker was missed (e.g. token already consumed before load).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0F13", color: "#8B94A6", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (!session) return <Login />;

  if (needsPassword) return <SetPassword onDone={() => setNeedsPassword(false)} />;

  return <App mode={isAdmin ? "admin" : "client"} />;
}
