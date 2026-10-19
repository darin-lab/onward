import { createFileRoute } from "@tanstack/react-router";
import { Roster } from "@/components/board/roster";
import { Shell } from "@/components/board/shell";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <Shell>
      <Roster />
    </Shell>
  );
}
