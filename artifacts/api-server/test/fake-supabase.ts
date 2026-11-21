/**
 * A tiny in-memory stand-in for the Supabase admin client: just the query
 * builder calls the email job makes (select / insert / update / delete with
 * eq, gt, gte, lt, lte, in, is, not, order, limit) and auth.admin.getUserById.
 * Not a test file (the runner only picks up *.test.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** Columns that together must be unique per table (a duplicate insert fails with 23505). */
  keys?: Record<string, string[]>;
  users?: Record<string, { email: string }>;
}

const cmp = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

class Query implements PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private returning = false;
  private sort: { col: string; asc: boolean } | null = null;
  private max: number | null = null;

  constructor(private db: FakeDb, private table: string) {}

  private rows(): Row[] {
    return (this.db.tables[this.table] ??= []);
  }

  select(_cols?: string) {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(values: Row | Row[]) { this.op = "insert"; this.payload = values; return this; }
  update(values: Row) { this.op = "update"; this.payload = values; return this; }
  delete() { this.op = "delete"; return this; }

  eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this; }
  neq(col: string, v: unknown) { this.filters.push((r) => r[col] !== v); return this; }
  gt(col: string, v: unknown) { this.filters.push((r) => cmp(r[col], v) > 0); return this; }
  gte(col: string, v: unknown) { this.filters.push((r) => cmp(r[col], v) >= 0); return this; }
  lt(col: string, v: unknown) { this.filters.push((r) => cmp(r[col], v) < 0); return this; }
  lte(col: string, v: unknown) { this.filters.push((r) => cmp(r[col], v) <= 0); return this; }
  in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this; }
  is(col: string, v: null) { this.filters.push((r) => (r[col] ?? null) === v); return this; }
  not(col: string, op: string, v: unknown) {
    if (op !== "is") throw new Error(`fake: not(${op}) unsupported`);
    this.filters.push((r) => (r[col] ?? null) !== v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.sort = { col, asc: opts?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }

  private run() {
    const all = this.rows();
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const key = this.db.keys?.[this.table];
      for (const item of items) {
        if (key && all.some((r) => key.every((k) => r[k] === item[k]))) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        all.push({ ...item });
      }
      return { data: this.returning ? items : null, error: null };
    }
    if (this.op === "update") {
      const hit = all.filter(match);
      for (const r of hit) Object.assign(r, this.payload);
      return { data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === "delete") {
      const keep = all.filter((r) => !match(r));
      const gone = all.length - keep.length;
      this.db.tables[this.table] = keep;
      return { data: null, error: null, count: gone } as { data: unknown; error: null };
    }
    let out = all.filter(match).map((r) => ({ ...r }));
    if (this.sort) {
      const { col, asc } = this.sort;
      out.sort((a, b) => cmp(a[col], b[col]) * (asc ? 1 : -1));
    }
    if (this.max != null) out = out.slice(0, this.max);
    return { data: out, error: null };
  }

  then<A, B>(ok?: ((v: { data: unknown; error: { code?: string; message: string } | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
}

export function fakeSupabase(db: FakeDb): SupabaseClient {
  return {
    from: (table: string) => new Query(db, table),
    // claim_email: take a (kind, ref, recipient) once, as the real function does for fresh rows.
    rpc: async (fn: string, a: { p_kind: string; p_ref_id: string; p_recipient_id: string }) => {
      if (fn !== "claim_email") return { data: null, error: { message: `fake: rpc ${fn} unsupported` } };
      const log = (db.tables.email_log ??= []);
      if (log.some((r) => r.kind === a.p_kind && r.ref_id === a.p_ref_id && r.recipient_id === a.p_recipient_id)) return { data: false, error: null };
      log.push({ kind: a.p_kind, ref_id: a.p_ref_id, recipient_id: a.p_recipient_id, status: "pending", attempts: 1, updated_at: new Date().toISOString() });
      return { data: true, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = db.users?.[id];
          return { data: { user: u ? { id, email: u.email, email_confirmed_at: "2020-01-01T00:00:00Z" } : null }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;
}
