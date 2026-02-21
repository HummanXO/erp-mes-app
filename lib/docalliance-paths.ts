export type DocAllianceView = "parts" | "tasks" | "inventory" | "specifications" | "adminUsers"

const ROOT = "/docalliance"

const normalizePathname = (pathname: string) => pathname.replace(/\/+$/, "")

export function getDocAllianceViewFromPath(
  pathname: string,
  preferSpecifications: boolean
): DocAllianceView {
  const clean = normalizePathname(pathname)
  const segments = clean.split("?")[0].split("/").filter(Boolean)
  const section = segments[1]

  switch (section) {
    case "specifications":
      return "specifications"
    case "parts":
      return "parts"
    case "tasks":
      return "tasks"
    case "inventory":
      return "inventory"
    case "admin":
      return "adminUsers"
    default:
      return preferSpecifications ? "specifications" : "parts"
  }
}

export function getDocAlliancePathForView(view: DocAllianceView): string {
  switch (view) {
    case "specifications":
      return `${ROOT}/specifications`
    case "tasks":
      return `${ROOT}/tasks`
    case "inventory":
      return `${ROOT}/inventory`
    case "adminUsers":
      return `${ROOT}/admin/users`
    case "parts":
    default:
      return `${ROOT}/parts`
  }
}

export function getDocAlliancePartsPath(partId?: string, tab?: string): string {
  const path = partId ? `${ROOT}/parts/${encodeURIComponent(partId)}` : `${ROOT}/parts`
  if (!tab) return path
  const params = new URLSearchParams()
  params.set("tab", tab)
  return `${path}?${params.toString()}`
}

export function getDocAlliancePartTaskPath(partId: string, taskId: string): string {
  return `${ROOT}/parts/${encodeURIComponent(partId)}/tasks/${encodeURIComponent(taskId)}`
}

export function getDocAllianceTasksPath(taskId?: string): string {
  return taskId ? `${ROOT}/tasks/${encodeURIComponent(taskId)}` : `${ROOT}/tasks`
}

export function getDocAllianceSpecificationsPath(specId?: string): string {
  return specId ? `${ROOT}/specifications/${encodeURIComponent(specId)}` : `${ROOT}/specifications`
}

export function getDocAllianceInventoryPath(tab?: string): string {
  const path = `${ROOT}/inventory`
  if (!tab) return path
  const params = new URLSearchParams()
  params.set("tab", tab)
  return `${path}?${params.toString()}`
}

export function getDocAllianceAdminUsersPath(): string {
  return `${ROOT}/admin/users`
}
