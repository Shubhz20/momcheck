import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <Link to="/" className="inline-flex h-10 items-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
          Go to dashboard
        </Link>
      }
    >
      The page you opened doesn't exist.
    </EmptyState>
  );
}
