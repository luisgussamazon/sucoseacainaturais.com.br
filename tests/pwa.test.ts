import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import manifest from "../src/app/manifest";
function harness() {
  const listeners = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const calls: { url: string; options: any }[] = [];
  let online = true;
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (key: string, response: Response) => {
        store.set(key, response.clone());
      },
      match: async (key: string) => store.get(key)?.clone(),
    };
  };
  const context = {
    URL,
    Response,
    self: {
      location: { origin: "https://amazonitos.test" },
      addEventListener: (name: string, fn: (event: any) => void) =>
        listeners.set(name, fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async (name: string) => cacheFor(name),
      keys: async () => Array.from(stores.keys()),
      delete: async (name: string) => stores.delete(name),
    },
    fetch: async (request: any, options: any) => {
      calls.push({
        url: typeof request === "string" ? request : request.url,
        options,
      });
      if (!online) throw new Error("offline");
      return new Response(
        typeof request === "string" && request === "/offline.html"
          ? "OFFLINE_PUBLIC_PAGE"
          : "SENSITIVE_NETWORK_ONLY",
        { status: 200 },
      );
    },
  };
  vm.runInNewContext(readFileSync(resolve("public/sw.js"), "utf8"), context);
  return {
    stores,
    calls,
    setOffline: () => {
      online = false;
    },
    lifecycle: async (name: string) => {
      let promise: Promise<unknown> | undefined;
      listeners.get(name)!({
        waitUntil: (value: Promise<unknown>) => (promise = value),
      });
      await promise;
    },
    request: (
      path: string,
      mode = "cors",
      method = "GET",
      headers: Record<string, string> = {},
    ) => {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")!({
        request: {
          url: path.startsWith("http")
            ? path
            : `https://amazonitos.test${path}`,
          method,
          mode,
          headers: { get: (name: string) => headers[name] ?? null },
        },
        respondWith: (value: Promise<Response>) => (response = value),
      });
      return response;
    },
  };
}
test("PWA armazena somente recursos públicos, sem cookies nas requisições de instalação", async () => {
  const h = harness();
  await h.lifecycle("install");
  const keys = Array.from(h.stores.values()).flatMap((s) =>
    Array.from(s.keys()),
  );
  assert.equal(keys.length, 6);
  for (const key of keys)
    assert.ok(
      key === "/offline.html" ||
        key === "/brand.svg" ||
        /^\/icons\/[a-z0-9-]+\.png$/.test(key),
    );
  for (const call of h.calls) {
    assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.cache, "no-store");
  }
});
test("páginas privadas usam rede e offline recebe somente página genérica", async () => {
  const h = harness();
  await h.lifecycle("install");
  const count = Array.from(h.stores.values()).reduce((n, s) => n + s.size, 0);
  const online = await h.request("/carteira", "navigate");
  assert.equal(await online!.text(), "SENSITIVE_NETWORK_ONLY");
  assert.equal(h.calls.at(-1)!.options.cache, "no-store");
  h.setOffline();
  const offline = await h.request("/carteira", "navigate");
  assert.equal(await offline!.text(), "OFFLINE_PUBLIC_PAGE");
  assert.equal(
    Array.from(h.stores.values()).reduce((n, s) => n + s.size, 0),
    count,
  );
});
test("API e RSC nunca entram no cache nem recebem HTML offline", async () => {
  const h = harness();
  await h.lifecycle("install");
  for (const [url, headers] of [
    ["/api/health", {}],
    ["/carteira?_rsc=private", {}],
    ["/carteira", { RSC: "1" }],
  ] as [string, Record<string, string>][]) {
    await h.request(url, "cors", "GET", headers);
    assert.equal(h.calls.at(-1)!.options.cache, "no-store");
  }
  h.setOffline();
  await assert.rejects(h.request("/api/health")!);
  assert.equal(h.request("/carteira", "cors", "POST"), undefined);
  assert.equal(h.request("https://other.test/api"), undefined);
  for (const store of h.stores.values())
    assert.ok(
      !Array.from(store.keys()).some(
        (k) => k.includes("api") || k.includes("carteira"),
      ),
    );
});
test("ativação limpa somente caches antigos da própria PWA", async () => {
  const h = harness();
  h.stores.set("amazonitos-public-old", new Map());
  h.stores.set("unrelated-cache", new Map());
  await h.lifecycle("install");
  await h.lifecycle("activate");
  assert.ok(!h.stores.has("amazonitos-public-old"));
  assert.ok(h.stores.has("unrelated-cache"));
  assert.ok(h.stores.has("amazonitos-public-v3"));
});
test("manifest e ícones próprios têm dimensões válidas para instalação", () => {
  const m = manifest();
  assert.equal(m.name, "SSD VBJ2");
  assert.equal(m.short_name, "SSD VBJ2");
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.equal(m.theme_color, "#131921");
  for (const icon of m.icons ?? []) {
    const bytes = readFileSync(resolve("public", icon.src.replace(/^\//, "")));
    const size = Number(icon.sizes!.split("x")[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  assert.ok(m.icons?.some((i) => i.purpose === "maskable"));
  const apple = readFileSync("public/icons/apple-touch-icon.png");
  assert.equal(apple.readUInt32BE(16), 180);
});
