import { useAuth } from "./lib/auth.js";
import Login from "./Login.jsx";
import App from "./App.jsx";

// Top-level gate:
//  - not logged in            -> Login
//  - logged in as admin       -> full dashboard (App, mode="admin")
//  - logged in as client      -> read-only portal over granted projects (App, mode="client")
// The same App component runs in both modes; the database (RLS) guarantees a
// client can only ever read their own projects, so even the admin UI code,
// if a client somehow reached it, would return no forbidden rows.
export default function Root() {
  const { loading, session, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0F13", color: "#8B94A6", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (!session) return <Login />;

  return <App mode={isAdmin ? "admin" : "client"} />;
}
