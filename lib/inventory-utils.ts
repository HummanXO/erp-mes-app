import type { Qty } from "./inventory-types"

export function normalizeQty(qty?: Qty): Required<Qty> {
  return {
    pcs: qty?.pcs ?? 0,
    kg: qty?.kg ?? 0,
  }
}

export function formatQty(qty?: Qty): string {
  if (!qty) return "0"
  const parts: string[] = []
  if (qty.pcs !== undefined) parts.push(`${qty.pcs} шт`)
  if (qty.kg !== undefined) parts.push(`${qty.kg} кг`)
  return parts.length > 0 ? parts.join(" • ") : "0"
}

export function isBelowMin(qty?: Qty, min?: Qty): boolean {
  if (!qty || !min) return false
  const q = normalizeQty(qty)
  const m = normalizeQty(min)
  const belowPcs = min.pcs !== undefined && q.pcs < m.pcs
  const belowKg = min.kg !== undefined && q.kg < m.kg
  return belowPcs || belowKg
}
