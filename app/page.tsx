import dynamic from "next/dynamic"

const ClientApp = dynamic(() => import("@/components/client-app").then(m => m.ClientApp), {
  ssr: false,
  loading: () => null,
})

export default function Home() {
  return <ClientApp />
}
