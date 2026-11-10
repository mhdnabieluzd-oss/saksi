import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="The page you asked for does not exist or has moved."
        action={
          <Button asChild variant="secondary">
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}
