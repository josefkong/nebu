import { useState } from "react";
import { supabase } from "./lib/supabase.js";

const C = { graphite: "#0D0F13", panel: "#15181F", ink: "#ECEAE4", inkSoft: "#8B94A6", line: "#23272F", copper: "#D98A5F" };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message);
  };

  const inp = { width: "100%", boxSizing: "border-box", padding: "11px 13px", marginBottom: 10, borderRadius: 9,
    border: `1px solid ${C.line}`, background: C.graphite, color: C.ink, fontSize: 14, fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: C.graphite, color: C.ink, display: "flex", alignItems: "center",
      justifyContent: "center", padding: 20, fontFamily: "'Google Sans','DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..800&display=swap');"}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", textAlign: "center", marginBottom: 6 }}>
          Nebu<span style={{ color: C.copper }}>.</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, textAlign: "center", marginBottom: 24 }}>Sign in to your portal</div>
        <form onSubmit={submit} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }}>
          <input style={inp} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input style={inp} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {err && <div style={{ color: "#E2918B", fontSize: 12, marginBottom: 10 }}>{err}</div>}
          <button type="submit" disabled={busy} style={{ width: "100%", padding: "11px 0", borderRadius: 9, border: "none",
            background: C.copper, color: C.graphite, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div style={{ fontSize: 11, color: C.inkSoft, textAlign: "center", marginTop: 16, opacity: 0.7 }}>
          Forgot your password? Ask your account manager to send a reset link.
        </div>
      </div>
    </div>
  );
}
