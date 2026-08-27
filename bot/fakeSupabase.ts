// A hand-rolled in-memory stand-in for the postgrest query builder, used by
// the bot's tests (bot/tools.test.ts). It exists because `tsc` cannot see a
// wrong column name, a missing `eq(user_id)` scope, or an `undefined` value in
// an insert — all of which reach the household as silence, not an exception.
// So this fake is deliberately STRICT: unknown tables, non-column select
// expressions and undefined insert values throw instead of quietly working.
//
// It is not a Postgres: no RLS, no constraints, no transactions. It only has
// to be honest about the query shapes bot/planning.ts actually issues.

export type FakeRow = Record<string, unknown>;

export interface FakeDb {
  [table: string]: FakeRow[];
}

export interface FakeSupabase {
  from(table: string): unknown;
  db: FakeDb;
  queries: string[];
}

export function makeFakeSupabase(seed: FakeDb): FakeSupabase {
  const db: FakeDb = { ...seed };
  const queries: string[] = [];
  let seq = 0;

  function builder(table: string) {
    if (!(table in db)) throw new Error(`fake supabase: unknown table "${table}"`);
    const filters: Array<(r: FakeRow) => boolean> = [];
    const shape: string[] = [];
    const orders: string[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: FakeRow[] = [];
    let patch: FakeRow = {};
    let columns: string[] | null = null;
    let limit = Infinity;

    const matching = () => db[table].filter((r) => filters.every((f) => f(r)));
    const project = (r: FakeRow) =>
      columns ? Object.fromEntries(columns.map((c) => [c, r[c] ?? null])) : { ...r };

    const api = {
      select(cols?: string) {
        if (cols && cols !== "*") {
          columns = cols.split(",").map((c) => c.trim());
          for (const c of columns) {
            if (!/^[a-z_]+$/.test(c)) throw new Error(`fake supabase: bad select column "${c}"`);
          }
        }
        return api;
      },
      eq(col: string, val: unknown) {
        shape.push(`eq(${col})`);
        filters.push((r) => r[col] === val);
        return api;
      },
      is(col: string, val: unknown) {
        shape.push(`is(${col})`);
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      in(col: string, vals: unknown[]) {
        shape.push(`in(${col})`);
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      lte(col: string, val: string) {
        shape.push(`lte(${col})`);
        filters.push((r) => String(r[col]) <= val);
        return api;
      },
      gte(col: string, val: string) {
        shape.push(`gte(${col})`);
        filters.push((r) => String(r[col]) >= val);
        return api;
      },
      ilike(col: string, pattern: string) {
        shape.push(`ilike(${col})`);
        const needle = pattern.replace(/%/g, "").toLowerCase();
        filters.push((r) => String(r[col] ?? "").toLowerCase().includes(needle));
        return api;
      },
      order(col: string) {
        orders.push(col);
        return api;
      },
      limit(n: number) {
        limit = n;
        return api;
      },
      insert(values: FakeRow | FakeRow[]) {
        mode = "insert";
        payload = Array.isArray(values) ? values : [values];
        return api;
      },
      update(values: FakeRow) {
        mode = "update";
        patch = values;
        return api;
      },
      delete() {
        mode = "delete";
        return api;
      },
      single() {
        return api.then((res) => ({ ...res, data: (res.data as FakeRow[])[0] ?? null }));
      },
      maybeSingle() {
        return api.single();
      },
      then<T>(resolve: (value: { data: FakeRow[] | FakeRow | null; error: null }) => T): Promise<T> {
        queries.push(`${mode} ${table} ${shape.join(" ")}`.trim());
        let data: FakeRow[] = [];
        if (mode === "insert") {
          for (const value of payload) {
            const row: FakeRow = {
              id: `${table}-${++seq}`,
              created_at: new Date().toISOString(),
              ...value,
            };
            for (const [key, v] of Object.entries(row)) {
              if (v === undefined) throw new Error(`fake supabase: ${table}.${key} is undefined`);
            }
            db[table].push(row);
            data.push(project(row));
          }
        } else if (mode === "update") {
          const hit = matching();
          for (const row of hit) Object.assign(row, patch);
          data = hit.map(project);
        } else if (mode === "delete") {
          const doomed = new Set(matching());
          db[table] = db[table].filter((r) => !doomed.has(r));
        } else {
          data = matching()
            .sort(
              (a, b) =>
                orders
                  .map((o) => String(a[o] ?? "").localeCompare(String(b[o] ?? "")))
                  .find((n) => n !== 0) ?? 0,
            )
            .slice(0, limit)
            .map(project);
        }
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return api;
  }

  return { from: (table: string) => builder(table), db, queries };
}
