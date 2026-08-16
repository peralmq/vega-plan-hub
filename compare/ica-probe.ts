// One-shot ICA login verification + endpoint mapper (p5-04). Run after
// filling ICA_PERSONNUMMER/ICA_PASSWORD in compare/.env:
//
//   npm run ica-probe
//
// Logs in, confirms the session sticks on handlaprivatkund.ica.se, then
// probes the favorites/"Återkommande"/slot surfaces read-only. Prints
// statuses, JSON keys and discovered /api/ paths — never response bodies
// (no personal data in output). Findings feed the next implementation
// iteration; nothing here writes anything anywhere.
import { loadCompareEnv } from "./env";
import { IcaSession, hasIcaAuth } from "./ica-auth";
import { ICA_DEFAULT_STORE } from "./stores";

loadCompareEnv();
if (!hasIcaAuth()) {
  console.error("fill ICA_PERSONNUMMER and ICA_PASSWORD in compare/.env first");
  process.exit(1);
}

const session = new IcaSession(ICA_DEFAULT_STORE.accountId);
await session.ensure(process.env.ICA_PERSONNUMMER!.trim(), process.env.ICA_PASSWORD!);
console.log("✓ session OK (reused if persisted, full login otherwise)");

const id = ICA_DEFAULT_STORE.accountId;
const jsonProbes = [
  `/stores/${id}/api/webproductpagews/v6/product-pages/favorites`,
  `/stores/${id}/api/favorites`,
  `/stores/${id}/api/regulars`,
  `/stores/${id}/api/ecomdeliverydestinations`,
  `/stores/${id}/api/address`,
];
for (const path of jsonProbes) {
  const res = await session.request(path);
  const text = await res.text();
  let summary: string;
  try {
    const json: unknown = JSON.parse(text);
    summary = Array.isArray(json)
      ? `array[${json.length}] item-keys=${Object.keys((json[0] as object) ?? {}).slice(0, 8).join(",")}`
      : Object.keys(json as object).slice(0, 10).join(",");
  } catch {
    summary = `non-JSON (${text.length}b)`;
  }
  console.log(`${res.status} ${path} :: ${summary}`);
  await new Promise((r) => setTimeout(r, 800));
}

// The favorites/regulars pages themselves: 200 + their /api/ calls tell
// us the real endpoints even when the guesses above miss.
for (const page of [`/stores/${id}/favorites`, `/stores/${id}/regulars`]) {
  const res = await session.request(page, "text/html");
  const html = await res.text();
  const apiPaths = [...new Set([...html.matchAll(/["'](\/stores\/[^"']*\/api\/[^"']{3,120})["']/g)].map((m) => m[1]))];
  console.log(`${res.status} ${page} :: ${apiPaths.length} api path(s) referenced`);
  for (const p of apiPaths.slice(0, 12)) console.log(`    ${p}`);
  await new Promise((r) => setTimeout(r, 800));
}
