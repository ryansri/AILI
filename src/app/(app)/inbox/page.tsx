import { InboxView } from "@/components/inbox/inbox-view";
import { PEOPLE, TAGS } from "@/lib/mock/data";

export default function InboxPage() {
  return <InboxView people={PEOPLE} tags={TAGS} />;
}
