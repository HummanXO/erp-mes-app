import { redirect } from "next/navigation"

// Force dynamic rendering - this page depends on auth state
export const dynamic = "force-dynamic"
export const revalidate = 0

export default function Home() {
  redirect("/docalliance")
}
