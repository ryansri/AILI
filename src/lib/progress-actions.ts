"use server";

import { revalidatePath } from "next/cache";
import { run } from "./action-result";
import { getWorkspace } from "./data";
import { db } from "./db";
import type { Goals } from "./progress";

/** Weekly goals for Progress. 0 hides one. */
async function updateGoalsImpl(goals: Goals) {
  const workspace = await getWorkspace();
  const n = (v: unknown, max: number) => {
    const x = Math.round(Number(v));
    if (!Number.isFinite(x) || x < 0 || x > max) throw new Error(`Goals are whole numbers from 0 to ${max}.`);
    return x;
  };
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      goalPosts: n(goals.posts, 50),
      // LinkedIn allows about 100 requests a week; AILI keeps goals under that.
      goalRequests: n(goals.requests, 100),
      goalMessages: n(goals.messages, 500),
      goalComments: n(goals.comments, 200),
    },
  });
  revalidatePath("/progress");
}

export async function updateGoals(...args: Parameters<typeof updateGoalsImpl>) {
  return run(() => updateGoalsImpl(...args));
}
