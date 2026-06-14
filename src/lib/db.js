import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Data access layer.
//
// The UI works with a nested shape: projects -> stages -> tasks, plus
// finance[] and accesses[] per project. Postgres stores these as flat,
// related tables. This module is the ONLY place that knows how to translate
// between the two, so the UI never writes raw SQL and the database never sees
// UI-shaped blobs. If you ever change the schema, you change it here and the
// UI is untouched.
//
// Every write also returns/refetches so the UI state stays the source of truth.
// ---------------------------------------------------------------------------

// ---- Load the full workspace for the logged-in user ----
// Admin sees everything; a client sees only granted projects (enforced by RLS
// in the database, not here — this query is identical for both roles).
export async function loadProjects() {
  const { data: projects, error } = await supabase
    .from("projects")
    .select(`
      id, name, client, contact, created_at, position,
      stages:stages ( id, name, position,
        tasks:tasks ( id, title, status, urgency, client_visible, note, guide,
                      created_at, completed_at, due_date, recurrence, target, count, last_done, position )
      ),
      finance:finance ( id, title, category, payee, amount, due_date, recurrence, status,
                        last_paid, method, delivered_at, note, client_reported_at, client_method, position ),
      accesses:accesses ( id, label, category, username, password, url, note, position ),
      activity:activity ( id, when_label, text, created_at )
    `)
    .order("position", { ascending: true })
    .order("position", { foreignTable: "stages", ascending: true });

  if (error) throw error;

  // Map DB snake_case -> UI camelCase and sort children by position.
  return (projects || []).map(dbProjectToUI);
}

function dbProjectToUI(p) {
  const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
  return {
    id: p.id,
    name: p.name,
    client: p.client || "",
    contact: p.contact || "",
    stages: (p.stages || []).sort(byPos).map((s) => ({
      id: s.id,
      name: s.name,
      tasks: (s.tasks || []).sort(byPos).map(dbTaskToUI),
    })),
    finance: (p.finance || []).sort(byPos).map(dbFinanceToUI),
    accesses: (p.accesses || []).sort(byPos).map(dbAccessToUI),
    activity: (p.activity || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((a) => ({ id: a.id, when: a.when_label, text: a.text })),
  };
}

const dbTaskToUI = (t) => ({
  id: t.id, title: t.title, status: t.status, urgency: t.urgency,
  clientVisible: t.client_visible, note: t.note || "", guide: t.guide || undefined,
  createdAt: t.created_at, completedAt: t.completed_at, dueDate: t.due_date,
  recurrence: t.recurrence || "none", target: t.target ?? undefined,
  count: t.count ?? undefined, lastDone: t.last_done ?? undefined,
});

const dbFinanceToUI = (f) => ({
  id: f.id, title: f.title, category: f.category, payee: f.payee || "",
  amount: Number(f.amount), dueDate: f.due_date, recurrence: f.recurrence || "none",
  status: f.status, lastPaid: f.last_paid, method: f.method,
  deliveredAt: f.delivered_at, note: f.note || "",
  clientReportedAt: f.client_reported_at, clientMethod: f.client_method,
});

const dbAccessToUI = (a) => ({
  id: a.id, label: a.label, category: a.category, username: a.username || "",
  password: a.password || "", url: a.url || "", note: a.note || "",
});

// ---- Generic helpers ----------------------------------------------------
// The UI mutates a whole project object then asks us to persist the diff.
// To keep this approachable, we expose granular operations the UI calls
// directly. Each maps one UI action to one DB write.

export const db = {
  // Projects
  async createProject({ name, client }) {
    const { data, error } = await supabase.from("projects")
      .insert({ name, client }).select().single();
    if (error) throw error;
    // every project starts with one Discovery stage to match the prototype
    await supabase.from("stages").insert({ project_id: data.id, name: "Discovery", position: 0 });
    return data.id;
  },
  async updateProject(id, patch) {
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) throw error;
  },
  async deleteProject(id) {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
  },

  // Stages
  async createStage(projectId, name, position) {
    const { data, error } = await supabase.from("stages")
      .insert({ project_id: projectId, name, position }).select().single();
    if (error) throw error;
    return data.id;
  },
  async createStageWithTasks(projectId, name, position, tasks) {
    const { data, error } = await supabase.from("stages")
      .insert({ project_id: projectId, name, position }).select().single();
    if (error) throw error;
    if (tasks?.length) {
      const rows = tasks.map((t, i) => ({
        stage_id: data.id, title: t.title, note: t.note || "", guide: t.guide || null,
        status: "todo", urgency: "none", client_visible: true, position: i,
        recurrence: t.recurrence || "none", due_date: t.dueDate || null,
        target: t.target ?? null, count: t.target ? 0 : null,
      }));
      const { error: tErr } = await supabase.from("tasks").insert(rows);
      if (tErr) throw tErr;
    }
    return data.id;
  },
  async updateStage(id, patch) {
    const { error } = await supabase.from("stages").update(patch).eq("id", id);
    if (error) throw error;
  },
  async deleteStage(id) {
    const { error } = await supabase.from("stages").delete().eq("id", id);
    if (error) throw error;
  },
  async reorderStages(orderedIds) {
    // batched position update
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("stages").update({ position: i }).eq("id", id)));
  },
  async reorderProjects(orderedIds) {
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("projects").update({ position: i }).eq("id", id)));
  },
  async reorderClients(orderedIds) {
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("clients").update({ position: i }).eq("id", id)));
  },
  async reorderAccesses(orderedIds) {
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("accesses").update({ position: i }).eq("id", id)));
  },

  // Tasks — patch keys are already snake_case from the caller
  async createTask(stageId, title, position) {
    const { data, error } = await supabase.from("tasks")
      .insert({ stage_id: stageId, title, status: "todo", urgency: "none",
                client_visible: true, recurrence: "none", position }).select().single();
    if (error) throw error;
    return data.id;
  },
  async updateTask(id, patch) {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) throw error;
  },
  async deleteTask(id) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
  },
  async moveTask(id, stageId, position) {
    const { error } = await supabase.from("tasks")
      .update({ stage_id: stageId, position }).eq("id", id);
    if (error) throw error;
  },

  // Finance
  async createPayment(projectId, item, position) {
    const { error } = await supabase.from("finance").insert({
      project_id: projectId, title: item.title, category: item.category,
      payee: item.payee || "", amount: item.amount, due_date: item.dueDate || null,
      recurrence: item.recurrence || "none", status: "pending",
      delivered_at: item.deliveredAt || null, note: item.note || "", position,
    });
    if (error) throw error;
  },
  async updatePayment(id, patch) {
    const { error } = await supabase.from("finance").update(patch).eq("id", id);
    if (error) throw error;
  },
  async deletePayment(id) {
    const { error } = await supabase.from("finance").delete().eq("id", id);
    if (error) throw error;
  },

  // Accesses
  async createAccess(projectId, item, position) {
    const { error } = await supabase.from("accesses").insert({
      project_id: projectId, label: item.label, category: item.category,
      username: item.username || "", password: item.password || "",
      url: item.url || "", note: item.note || "", position,
    });
    if (error) throw error;
  },
  async updateAccess(id, patch) {
    const { error } = await supabase.from("accesses").update(patch).eq("id", id);
    if (error) throw error;
  },
  async deleteAccess(id) {
    const { error } = await supabase.from("accesses").delete().eq("id", id);
    if (error) throw error;
  },

  // Activity
  async addActivity(projectId, whenLabel, text) {
    const { error } = await supabase.from("activity")
      .insert({ project_id: projectId, when_label: whenLabel, text });
    if (error) throw error;
  },

  // Clients
  async loadClients() {
    const { data, error } = await supabase.from("clients")
      .select("id, name, company, email, status, last_reset, position, client_projects(project_id)")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((c) => ({
      id: c.id, name: c.name, company: c.company || "", email: c.email,
      status: c.status, lastReset: c.last_reset,
      projectIds: (c.client_projects || []).map((cp) => cp.project_id),
    }));
  },
  async createClient(c) {
    const { data, error } = await supabase.from("clients")
      .insert({ name: c.name, company: c.company || "", email: c.email, status: "invited" })
      .select().single();
    if (error) throw error;
    return data.id;
  },
  async updateClient(id, patch) {
    const { error } = await supabase.from("clients").update(patch).eq("id", id);
    if (error) throw error;
  },
  async deleteClient(id) {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
  },
  async grantAccess(clientId, projectId) {
    const { error } = await supabase.from("client_projects")
      .insert({ client_id: clientId, project_id: projectId });
    if (error) throw error;
  },
  async revokeAccess(clientId, projectId) {
    const { error } = await supabase.from("client_projects")
      .delete().eq("client_id", clientId).eq("project_id", projectId);
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// Full-project reconcile.
//
// The prototype's handlers mutate a whole project object (add a task, cycle a
// status, reorder, edit finance, etc.). Rather than wire ~30 individual write
// calls, persistProject() upserts the project's current state in one pass.
// Every row carries a stable uuid `id`, so upsert is idempotent: existing rows
// update, new rows insert. Deletions are handled by the explicit db.delete*
// calls the UI already triggers for removals.
//
// This trades a little write amplification for a dramatically smaller surface
// area and far fewer places a bug can hide — the right call at this scale.
// ---------------------------------------------------------------------------
export async function persistProject(p) {
  // project row
  await supabase.from("projects").upsert({
    id: p.id, name: p.name, client: p.client || "", contact: p.contact || "",
  });

  // stages with positions
  const stageRows = p.stages.map((s, i) => ({ id: s.id, project_id: p.id, name: s.name, position: i }));
  if (stageRows.length) await supabase.from("stages").upsert(stageRows);

  // tasks with positions, mapped UI -> DB
  const taskRows = [];
  p.stages.forEach((s) => s.tasks.forEach((t, i) => taskRows.push({
    id: t.id, stage_id: s.id, title: t.title, status: t.status, urgency: t.urgency,
    client_visible: t.clientVisible, note: t.note || "", guide: t.guide || null,
    completed_at: t.completedAt || null, due_date: t.dueDate || null,
    recurrence: t.recurrence || "none", target: t.target ?? null,
    count: t.count ?? null, last_done: t.lastDone || null, position: i,
  })));
  if (taskRows.length) await supabase.from("tasks").upsert(taskRows);

  // finance
  const finRows = (p.finance || []).map((f, i) => ({
    id: f.id, project_id: p.id, title: f.title, category: f.category, payee: f.payee || "",
    amount: f.amount, due_date: f.dueDate || null, recurrence: f.recurrence || "none",
    status: f.status, last_paid: f.lastPaid || null, method: f.method || null,
    delivered_at: f.deliveredAt || null, note: f.note || "",
    client_reported_at: f.clientReportedAt || null, client_method: f.clientMethod || null, position: i,
  }));
  if (finRows.length) await supabase.from("finance").upsert(finRows);

  // accesses
  const accRows = (p.accesses || []).map((a, i) => ({
    id: a.id, project_id: p.id, label: a.label, category: a.category,
    username: a.username || "", password: a.password || "", url: a.url || "",
    note: a.note || "", position: i,
  }));
  if (accRows.length) await supabase.from("accesses").upsert(accRows);
}
