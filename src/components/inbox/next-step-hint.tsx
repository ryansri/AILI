import type { Row } from "@/lib/rows";

/**
 * One plain sentence under the next step. Until the AI layer arrives this is
 * rule based: it reads the last message and says what the playbook says to do.
 */
export function NextStepHint({ row }: { row: Row }) {
  const { person, step } = row;
  const last = person.messages[person.messages.length - 1];
  const first = person.name.split(" ")[0];

  if (step.kind === "reply") {
    if (!last) return <>They accepted your request. Send the first message.</>;
    const text = last.body.toLowerCase();
    if (text.includes("cost") || text.includes("price"))
      return <>{first} asked about cost. Give a ballpark, then ask how it is done now.</>;
    if (text.includes("already have"))
      return <>{first} already has a tool. Do not knock it. Ask how it is holding up.</>;
    if (text.includes("not right now") || text.includes("not now"))
      return <>{first} said not now. Offer to check back in a quarter, then snooze.</>;
    if (text.includes("thanks for connecting"))
      return <>{first} opened the door. Send the first message with your hook.</>;
    return <>Match {first}&apos;s length and energy, ask one curious question.</>;
  }
  if (step.kind === "chase") {
    if (step.step === "Follow-up 1") return <>About 40 words, carry the pilot offer, add something new.</>;
    if (step.step === "Follow-up 2") return <>About 30 words, close the loop, no pressure.</>;
    return <>Snooze is over. Send a short check-in.</>;
  }
  if (step.kind === "quiet") return <>Two follow-ups, no answer. One last try or mark as lost.</>;
  return <>{step.detail}. Nothing to do yet.</>;
}
