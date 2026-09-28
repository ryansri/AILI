/*
 * The server actions as the screens use them: each throws its message when it
 * fails, like a normal async function (see action-result.ts).
 */

import { unwrap } from "./action-result";
import * as actions from "./actions";
import * as posts from "./post-actions";
import * as plan from "./plan-actions";

export type { ImportRow, PersonInput } from "./actions";

export const updateStage = unwrap(actions.updateStage);
export const updateNotes = unwrap(actions.updateNotes);
export const toggleStar = unwrap(actions.toggleStar);
export const snooze = unwrap(actions.snooze);
export const markDone = unwrap(actions.markDone);
export const reopen = unwrap(actions.reopen);
export const archivePerson = unwrap(actions.archivePerson);
export const logMessage = unwrap(actions.logMessage);
export const queueSend = unwrap(actions.queueSend);
export const discardDraft = unwrap(actions.discardDraft);
export const cancelQueued = unwrap(actions.cancelQueued);
export const createStage = unwrap(actions.createStage);
export const reorderStages = unwrap(actions.reorderStages);
export const renameStage = unwrap(actions.renameStage);
export const deleteStage = unwrap(actions.deleteStage);
export const createTag = unwrap(actions.createTag);
export const updateTag = unwrap(actions.updateTag);
export const deleteTag = unwrap(actions.deleteTag);
export const setPersonTag = unwrap(actions.setPersonTag);
export const createPerson = unwrap(actions.createPerson);
export const updatePerson = unwrap(actions.updatePerson);
export const finishOnboarding = unwrap(actions.finishOnboarding);
export const trackAsLead = unwrap(actions.trackAsLead);
export const moveToOther = unwrap(actions.moveToOther);
export const bulkSetStage = unwrap(actions.bulkSetStage);
export const bulkAddTag = unwrap(actions.bulkAddTag);
export const bulkArchive = unwrap(actions.bulkArchive);
export const importPeople = unwrap(actions.importPeople);
export const createTemplate = unwrap(actions.createTemplate);
export const updateTemplate = unwrap(actions.updateTemplate);
export const deleteTemplate = unwrap(actions.deleteTemplate);
export const queueBulk = unwrap(actions.queueBulk);
export const updateDailyCap = unwrap(actions.updateDailyCap);
export const updateNotifyReplies = unwrap(actions.updateNotifyReplies);
export const updateAccount = unwrap(actions.updateAccount);
export const changePassword = unwrap(actions.changePassword);
export const rotateHelperToken = unwrap(actions.rotateHelperToken);

export const savePost = unwrap(posts.savePost);
export const schedulePost = unwrap(posts.schedulePost);
export const unschedulePost = unwrap(posts.unschedulePost);
export const publishPostNow = unwrap(posts.publishPostNow);
export const retryFirstComment = unwrap(posts.retryFirstComment);
export const updateFirstCommentDelay = unwrap(posts.updateFirstCommentDelay);
export const deletePost = unwrap(posts.deletePost);
export const markArticlePublished = unwrap(posts.markArticlePublished);
export const saveTimeZone = unwrap(posts.saveTimeZone);
export const disconnectLinkedInPosting = unwrap(posts.disconnectLinkedInPosting);
export const disconnectAiApp = unwrap(posts.disconnectAiApp);

export const saveRhythm = unwrap(plan.saveRhythm);
export const addIdea = unwrap(plan.addIdea);
export const deleteIdea = unwrap(plan.deleteIdea);
export const ideaToSlot = unwrap(plan.ideaToSlot);
export const setSlotDay = unwrap(plan.setSlotDay);
export const setTimeZone = unwrap(plan.setTimeZone);
export const setRunwayAlert = unwrap(plan.setRunwayAlert);
