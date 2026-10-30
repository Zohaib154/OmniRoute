import dynamic from "next/dynamic";

export const metadata = {
  title: "Team Orchestrator — OmniRoute",
  description: "Multi-Model Team Orchestration Pipeline",
};

const TeamPageClient = dynamic(() => import("./TeamPageClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[640px] items-center justify-center p-4">
      <div className="text-sm text-text-muted">Loading Team Orchestrator...</div>
    </div>
  ),
});

export default function TeamPage() {
  return <TeamPageClient />;
}

