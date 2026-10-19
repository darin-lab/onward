import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Shell } from "@/components/board/shell";
import { TechView } from "@/components/board/tech-view";
import { useBoard } from "@/lib/board/store";

export const Route = createFileRoute("/t/$techId")({
  component: TechPage,
});

function TechPage() {
  const { techId } = Route.useParams();
  const tech = useBoard((state) => state.techs.find((item) => item.id === techId));
  const viewer = useBoard((state) => state.viewer);
  const techs = useBoard((state) => state.techs);
  const person = techs.find((item) => item.id === viewer);

  if (person?.kind === "technician" && person.id !== techId) {
    return <Navigate to="/t/$techId" params={{ techId: person.id }} />;
  }

  return (
    <Shell>
      {tech ? (
        <TechView tech={tech} />
      ) : (
        <div className="py-10">
          <h1 className="text-3xl">That name isn't on the crew</h1>
          <p className="mt-3 max-w-prose text-muted">
            They may have been renamed. The crew list is the sure way back.
          </p>
          <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-honey">
            Back to the crew
          </Link>
        </div>
      )}
    </Shell>
  );
}