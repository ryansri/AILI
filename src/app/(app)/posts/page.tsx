import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function PostsPage() {
  return (
    <div className="flex h-full w-full flex-col">
      <PageHeader title="Posts" />
      <EmptyState
        title="Coming in step 4"
        description="Draft a post with AI, edit it, then publish now or schedule it through LinkedIn's official API."
      />
    </div>
  );
}
