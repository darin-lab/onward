import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/board/shell";
import { DayReportForm } from "@/components/board/day-report";

export const Route = createFileRoute("/day/$shopId")({
  component: DayPage,
});

function DayPage() {
  const { shopId } = Route.useParams();
  return (
    <Shell>
      <DayReportForm shopId={shopId} />
    </Shell>
  );
}
