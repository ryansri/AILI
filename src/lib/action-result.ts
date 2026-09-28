import { unstable_rethrow } from "next/navigation";

/*
 * Server actions return their outcome instead of throwing. In a production
 * build React hides the message of any error thrown on the server (the user
 * sees "Minified React error #441"), so "Pick a time at least a minute from
 * now" would never reach them. run() catches it on the server and sends the
 * message back; unwrap() on the client throws it again, so screens keep
 * using try/catch as before.
 */

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Database and other internal errors are not for users' eyes; our own messages are. */
function messageOf(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong. Try again.";
  if (err.name.startsWith("Prisma") || err.constructor.name.startsWith("Prisma")) {
    return "Something went wrong saving that. Try again.";
  }
  return err.message || "Something went wrong. Try again.";
}

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    // redirect() and notFound() are errors Next.js must still see.
    unstable_rethrow(err);
    console.error(err);
    return { ok: false, error: messageOf(err) };
  }
}

export function unwrap<A extends unknown[], R>(action: (...args: A) => Promise<ActionResult<R>>) {
  return async (...args: A): Promise<R> => {
    const result = await action(...args);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
}
