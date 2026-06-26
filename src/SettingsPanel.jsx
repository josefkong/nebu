import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";

// ---------------------------------------------------------------------------
// Account settings for the signed-in user. Same component serves the admin and
// a client — the only difference is the surrounding chrome, passed in as props.
// Password and email both go through supabase.auth.updateUser, which operates on
// the *currently authenticated* user, so there is no way to edit anyone else's
// account here. Changing the password ends other active sessions (expected).
// ---------------------------------------------------------------------------
export default function SettingsPanel({ T, dark, dangerColor, isMobile, inputStyle, primaryBtn, ghostBtn }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);

  // password fields
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }

  // email change
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setEmail(data?.user?.email || "");
      setRole(data?.user?.app_metadata?.role || "client");
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const ok = dark ? "#9CC4A8" : "#3E7050";

  const changePassword = async () => {
    setPwMsg(null);
    if (pw1.length < 8) { setPwMsg({ ok: false, text: "Password must be at least 8 characters." }); return; }
    if (pw1 !== pw2) { setPwMsg({ ok: false, text: "The two passwords do not match." }); return; }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setPwBusy(false);
    if (error) { setPwMsg({ ok: false, text: error.message || "Could not update password." }); return; }
    setPw1(""); setPw2("");
    setPwMsg({ ok: true, text: "Password updated. Other devices have been signed out." });
  };

  const changeEmail = async () => {
    setEmailMsg(null);
    const e = newEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setEmailMsg({ ok: false, text: "Enter a valid email address." }); return; }
    if (e === email) { setEmailMsg({ ok: false, text: "That is already your email." }); return; }
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: e });
    setEmailBusy(false);
    if (error) { setEmailMsg({ ok: false, text: error.message || "Could not update email." }); return; }
    setNewEmail("");
    setEmailMsg({ ok: true, text: `Confirmation sent to ${e}. The change takes effect after you confirm from that inbox.` });
  };

  const card = {
    background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12,
    padding: isMobile ? "16px 16px" : "20px 22px", marginBottom: 16, maxWidth: 520,
  };
  const label = { fontSize: 11.5, fontWeight: 600, color: T.inkSoft, letterSpacing: 0.3, marginBottom: 6, display: "block" };
  const msgStyle = (m) => ({
    fontSize: 12, fontWeight: 600, marginTop: 10,
    color: m.ok ? ok : dangerColor,
  });

  if (loading) return <div style={{ color: T.inkSoft, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      {/* Identity */}
      <div style={card}>
        <h2 style={{ fontSize: 15, margin: "0 0 14px", fontWeight: 700 }}>Account</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <span style={label}>Email</span>
            <div style={{ fontSize: 13.5, fontFamily: "ui-monospace, Menlo, monospace" }}>{email}</div>
          </div>
          <div>
            <span style={label}>Role</span>
            <div style={{ fontSize: 13.5, textTransform: "capitalize" }}>{role}</div>
          </div>
        </div>
      </div>

      {/* Password */}
      <div style={card}>
        <h2 style={{ fontSize: 15, margin: "0 0 4px", fontWeight: 700 }}>Change password</h2>
        <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 14px" }}>Minimum 8 characters. Changing it signs you out on other devices.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
          <div>
            <span style={label}>New password</span>
            <input type="password" value={pw1} onChange={e => setPw1(e.target.value)} autoComplete="new-password"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <span style={label}>Confirm new password</span>
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password"
              onKeyDown={e => e.key === "Enter" && changePassword()}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <button onClick={changePassword} disabled={pwBusy} style={{ ...primaryBtn, opacity: pwBusy ? 0.6 : 1, cursor: pwBusy ? "default" : "pointer" }}>
              {pwBusy ? "Updating…" : "Update password"}
            </button>
          </div>
          {pwMsg && <div style={msgStyle(pwMsg)}>{pwMsg.text}</div>}
        </div>
      </div>

      {/* Email */}
      <div style={card}>
        <h2 style={{ fontSize: 15, margin: "0 0 4px", fontWeight: 700 }}>Change email</h2>
        <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 14px" }}>We send a confirmation link to the new address. The change only applies once you click it.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
          <div>
            <span style={label}>New email</span>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
              onKeyDown={e => e.key === "Enter" && changeEmail()}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <button onClick={changeEmail} disabled={emailBusy} style={{ ...primaryBtn, opacity: emailBusy ? 0.6 : 1, cursor: emailBusy ? "default" : "pointer" }}>
              {emailBusy ? "Sending…" : "Send confirmation"}
            </button>
          </div>
          {emailMsg && <div style={msgStyle(emailMsg)}>{emailMsg.text}</div>}
        </div>
      </div>
    </div>
  );
}
