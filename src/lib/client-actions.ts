/*
 * The server actions as the screens use them: each throws its message when it
 * fails, like a normal async function (see action-result.ts).
 */

import { unwrap } from "./action-result";
import * as actions from "./actions";
import * as posts from "./post-actions";
import * as media from "./media-actions";
import * as plan from "./plan-actions";
import * as companies from "./company-actions";
import * as invites from "./invite-actions";
import * as alerts from "./alert-actions";

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
export const retryQueued = unwrap(actions.retryQueued);
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
export const keepInOther = unwrap(actions.keepInOther);
export const moveEveryoneToOther = unwrap(actions.moveEveryoneToOther);
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
export const addFirstCommentToPost = unwrap(posts.addFirstCommentToPost);
export const cancelFirstCommentOnPost = unwrap(posts.cancelFirstCommentOnPost);
export const updateFirstCommentDelay = unwrap(posts.updateFirstCommentDelay);
export const deletePost = unwrap(posts.deletePost);
export const markArticlePublished = unwrap(posts.markArticlePublished);
export const saveTimeZone = unwrap(posts.saveTimeZone);
export const attachMedia = unwrap(media.attachMedia);
export const removeMedia = unwrap(media.removeMedia);
export const orderMedia = unwrap(media.orderMedia);
export const disconnectLinkedInPosting = unwrap(posts.disconnectLinkedInPosting);
export const disconnectAiApp = unwrap(posts.disconnectAiApp);

export const importPlan = unwrap(plan.importPlan);
export const addEntry = unwrap(plan.addEntry);
export const updateEntry = unwrap(plan.updateEntry);
export const moveEntry = unwrap(plan.moveEntry);
export const skipEntry = unwrap(plan.skipEntry);
export const markEntryPosted = unwrap(plan.markEntryPosted);
export const deleteEntry = unwrap(plan.deleteEntry);
export const deletePlan = unwrap(plan.deletePlan);
export const skipEntries = unwrap(plan.skipEntries);
export const deleteEntries = unwrap(plan.deleteEntries);
export const fillFromRhythm = unwrap(plan.fillFromRhythm);
export const setTimeZone = unwrap(plan.setTimeZone);
export const setPlanWarning = unwrap(plan.setPlanWarning);

export const nameCompany = unwrap(companies.nameCompany);
export const keepCompaniesApart = unwrap(companies.keepCompaniesApart);
export const queueInvite = unwrap(invites.queueInvite);
export const withdrawInvites = unwrap(invites.withdrawInvites);
export const setInviteSettings = unwrap(invites.setInviteSettings);
export const openedForAlerts = unwrap(alerts.openedForAlerts);
export const setAlerts = unwrap(alerts.setAlerts);
export const addTouch = unwrap(alerts.addTouch);
export const removeTouch = unwrap(alerts.removeTouch);
export const setAlertSettings = unwrap(alerts.setAlertSettings);
