import test from "node:test"
import assert from "node:assert/strict"

function moduleUrl(relativePath: string): string {
  return new URL(relativePath, import.meta.url).href
}

async function loadModule(relativePath: string) {
  const mod = await import(moduleUrl(relativePath))
  return (mod as any).default ?? mod
}

async function loadAdapterFresh() {
  const base = moduleUrl("../../lib/data-provider-adapter.ts")
  const withNonce = `${base}?nonce=${Date.now()}-${Math.random()}`
  const mod = await import(withNonce)
  return (mod as any).default ?? mod
}

test("API refresh path uses one batch call for logistics + norms", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000/api/v1"
  delete process.env.NEXT_PUBLIC_DEMO_MODE

  const httpProvider = await loadModule("../../lib/http-data-provider.ts")
  const apiClientModule = await loadModule("../../lib/api-client.ts")
  const apiClient = apiClientModule.apiClient

  const originalFetch = globalThis.fetch

  const calls = {
    batch: 0,
    movements: 0,
    norms: 0,
  }

  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/parts/batch/related")) {
      calls.batch += 1
      return new Response(
        JSON.stringify({
          items: [
            {
              part_id: "part-1",
              movements: [
                {
                  id: "mov-1",
                  part_id: "part-1",
                  status: "sent",
                  qty_sent: 5,
                  created_at: "2026-02-20T10:00:00Z",
                  updated_at: "2026-02-20T10:00:00Z",
                },
              ],
              norms: [
                {
                  machine_id: "m-1",
                  part_id: "part-1",
                  stage: "machining",
                  qty_per_shift: 120,
                  is_configured: true,
                  configured_at: "2026-02-20T10:00:00Z",
                  configured_by_id: "u-1",
                },
              ],
            },
            {
              part_id: "part-2",
              movements: [],
              norms: [],
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    }
    if (url.includes("/movements")) {
      calls.movements += 1
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.includes("/norms")) {
      calls.norms += 1
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    throw new Error(`Unexpected fetch url: ${url}`)
  }

  apiClient.setAccessToken("test-access-token")

  try {
    const preloadedParts = [{ id: "part-1" }, { id: "part-2" }] as any
    const [logistics, norms] = await Promise.all([
      httpProvider.getLogistics(preloadedParts),
      httpProvider.getMachineNorms(preloadedParts),
    ])

    assert.equal(calls.batch, 1)
    assert.equal(calls.movements, 0)
    assert.equal(calls.norms, 0)
    assert.equal(logistics.length, 1)
    assert.equal(norms.length, 1)
  } finally {
    apiClient.setAccessToken(null)
    globalThis.fetch = originalFetch
  }
})

test("API contract matrix marks unsupported context operations", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000/api/v1"
  delete process.env.NEXT_PUBLIC_DEMO_MODE

  const adapter = await loadAdapterFresh()

  assert.equal(adapter.isContextOperationSupportedInApi("createPart"), true)
  assert.equal(adapter.isContextOperationSupportedInApi("getPartProgress"), false)
})

test("API mode demo-only operation throws standardized unsupported error", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000/api/v1"
  delete process.env.NEXT_PUBLIC_DEMO_MODE

  const adapter = await loadAdapterFresh()

  assert.throws(
    () => adapter.getPartProgress("part-1"),
    (error: any) =>
      error?.name === "ProviderOperationError" &&
      error?.code === "UNSUPPORTED_OPERATION" &&
      error?.mode === "api" &&
      error?.operation === "getPartProgress"
  )
})

test("API mode capability-gated operation throws standardized unsupported error", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000/api/v1"
  delete process.env.NEXT_PUBLIC_DEMO_MODE

  const adapter = await loadAdapterFresh()

  assert.throws(
    () => adapter.getWorkOrders(),
    (error: any) =>
      error?.name === "ProviderOperationError" &&
      error?.code === "UNSUPPORTED_OPERATION" &&
      error?.mode === "api" &&
      error?.capability === "workOrders"
  )
})
