import { Suspense } from "react";
import TeamPageClient from "./TeamPageClient";

export async function generateMetadata() {
  return { title: "Team Orchestrator", description: "Multi-Model Team Orchestration Pipeline" };
}

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamPageClient />
    </Suspense>
  );
}
