import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/board/shell";
import { HallOfFame } from "@/components/board/hall-of-fame";

export const Route = createFileRoute("/hall-of-fame")({
  component: HallOfFamePage,
});

function HallOfFamePage() {
  return (
    <Shell>
      <HallOfFame />
    </Shell>
  );
}
