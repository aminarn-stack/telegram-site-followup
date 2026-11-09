import { randomUUID } from 'node:crypto';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { conflict, forbidden, notFound, validation } from '../lib/errors.js';
import {
  activeBpMilestoneOrder,
  BP_MILESTONE_ANSWER,
  BP_STEP_CODE,
  descendantsOf,
  isCoveredByBpMilestone,
  PORT_CHECK_STEP_CODE,
  recalculate,
  type StepSnapshot,
  type TemplateDefinition,
} from '../domain/workflow.js';

export interface StepUpdateInput {
  siteStepId: string;
  answer: string;
  comment?: string;
  expectedVersion: number;
  actorId: string;
  actorRole: Role;
  requestId?: string;
}

async function lockAndLoadStep(tx: Prisma.TransactionClient, siteStepId: string) {
  // Serialize changes to the same workflow before reading prerequisite states and step versions.
  await tx.$queryRaw`
    SELECT w."id"
    FROM "SiteWorkflow" w
    JOIN "SiteStep" s ON s."workflowId" = w."id"
    WHERE s."id" = ${siteStepId}
    FOR UPDATE OF w
  `;
  const target = await tx.siteStep.findUnique({
    where: { id: siteStepId },
    include: {
      templateStep: true,
      workflow: {
        include: {
          site: { include: { region: true, serviceCenter: true } },
          template: { include: { steps: { orderBy: { displayOrder: 'asc' } } } },
          steps: { include: { templateStep: true, escalation: true } },
        },
      },
    },
  });
  if (!target || !target.workflow.active) throw notFound('Active site step not found.');
  return target;
}

type WorkflowStep = Awaited<ReturnType<typeof lockAndLoadStep>>;

function workflowDefinition(target: WorkflowStep): TemplateDefinition {
  return {
    code: target.workflow.template.code,
    version: target.workflow.template.version,
    siteType: target.workflow.template.siteType,
    sectorAddition: target.workflow.template.sectorAddition,
    steps: target.workflow.template.steps.map((item) => ({
      code: item.code,
      order: item.displayOrder,
      label: item.label,
      prerequisiteCode: item.prerequisiteCode,
      type: item.stepType,
      answers: item.allowedAnswers as string[],
    })),
  };
}

async function updaterName(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  return actor ? `${actor.firstName}${actor.lastName ? ` ${actor.lastName}` : ''}` : 'Unknown';
}

async function persistStepStates(
  tx: Prisma.TransactionClient,
  target: WorkflowStep,
  calculated: ReturnType<typeof recalculate>,
  options: {
    comment: string;
    updater: string;
    eventTime: string;
    milestoneOrder?: number | undefined;
  },
) {
  for (const item of calculated.steps) {
    const persisted = target.workflow.steps.find(
      (candidate) => candidate.templateStep.code === item.code,
    )!;
    const bpMilestoneOverride = item.bpMilestoneOverride ?? false;
    if (persisted.state !== item.state || persisted.bpMilestoneOverride !== bpMilestoneOverride) {
      await tx.siteStep.update({
        where: { id: persisted.id },
        data: {
          state: item.state,
          bpMilestoneOverride,
          ...(persisted.id !== target.id ? { version: { increment: 1 } } : {}),
        },
      });
    }
    const existingEscalation = persisted.escalation;
    if (item.state === 'BLOCKED') {
      const source = item.code === target.templateStep.code ? options.comment : persisted.comment;
      const reason = source || `Blocked by ${item.code}`;
      if (
        existingEscalation &&
        !existingEscalation.resolvedAt &&
        persisted.state === 'BLOCKED' &&
        persisted.answer === item.answer &&
        existingEscalation.reason === reason
      ) {
        continue;
      }
      const escalation = await tx.escalation.upsert({
        where: { siteStepId: persisted.id },
        create: { siteStepId: persisted.id, reason },
        update: {
          reason,
          resolvedAt: null,
          notificationState: 'PENDING',
        },
      });
      await queueGroupNotifications(tx, 'ESCALATION', escalation.id, {
        siteId: target.workflow.site.siteIdText,
        region: target.workflow.site.region.code,
        serviceCenter: target.workflow.site.serviceCenter.code,
        step: persisted.templateStep.label,
        answer: item.answer,
        comment: source,
        updater: options.updater,
        eventTime: options.eventTime,
        deepLinkTarget: { kind: 'site', publicId: target.workflow.site.publicId },
      });
    } else if (existingEscalation && !existingEscalation.resolvedAt) {
      await tx.escalation.update({
        where: { id: existingEscalation.id },
        data: { resolvedAt: new Date(), notificationState: 'PENDING' },
      });
      await queueGroupNotifications(tx, 'RESOLUTION', existingEscalation.id, {
        siteId: target.workflow.site.siteIdText,
        region: target.workflow.site.region.code,
        serviceCenter: target.workflow.site.serviceCenter.code,
        step: persisted.templateStep.label,
        answer: isCoveredByBpMilestone(
          options.milestoneOrder,
          persisted.templateStep.displayOrder,
          item.bpMilestoneOverride,
        )
          ? 'Covered by BP milestone'
          : item.answer,
        updater: options.updater,
        eventTime: options.eventTime,
        deepLinkTarget: { kind: 'site', publicId: target.workflow.site.publicId },
      });
    }
  }
  await tx.siteWorkflow.update({
    where: { id: target.workflow.id },
    data: {
      status: calculated.siteStatus,
      completedAt: calculated.siteStatus === 'COMPLETED' ? new Date() : null,
    },
  });
}

export async function updateSiteStep(input: StepUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const target = await lockAndLoadStep(tx, input.siteStepId);
    if (target.version !== input.expectedVersion) {
      throw conflict('This step was updated by another user. Refresh and try again.', {
        currentVersion: target.version,
      });
    }
    const isBp = target.templateStep.code === BP_STEP_CODE;
    const isPortCheck = target.templateStep.code === PORT_CHECK_STEP_CODE;
    const appliesMilestone = isBp && input.answer === BP_MILESTONE_ANSWER;
    const milestoneOrder = activeBpMilestoneOrder(target.workflow.steps);
    if (
      milestoneOrder !== undefined &&
      (isBp ||
        (!isPortCheck && isCoveredByBpMilestone(milestoneOrder, target.templateStep.displayOrder)))
    ) {
      throw conflict('An administrator must reopen the BP milestone before changing this step.');
    }
    if ((target.state === 'LOCKED' && !appliesMilestone) || target.state === 'NEEDS_REVIEW') {
      const prerequisite = target.templateStep.prerequisiteCode;
      throw conflict('This step is not actionable.', { unsatisfiedPrerequisite: prerequisite });
    }
    const allowed = target.templateStep.allowedAnswers as string[];
    if (!allowed.includes(input.answer) || (input.answer === BP_MILESTONE_ANSWER && !isBp))
      throw validation('The selected answer is not allowed for this step.');
    const definition = workflowDefinition(target);
    const descendants = descendantsOf(definition, target.templateStep.code);
    const completedDescendant = target.workflow.steps.some(
      (item) => descendants.has(item.templateStep.code) && item.state === 'COMPLETED',
    );
    if (!appliesMilestone && completedDescendant && target.answer !== input.answer) {
      if (input.actorRole !== 'ADMIN') {
        throw forbidden(
          'An administrator must reopen this branch before changing the prerequisite.',
        );
      }
      throw conflict('Reopen this branch with a reason before changing the prerequisite.');
    }
    const negativeAnswers = [
      'Not Done',
      'Not Available',
      'NOK',
      'Not Received',
      'Rejected',
      'Not Submitted',
      'Not submitted',
      'Not Delivered',
      'Not delivered',
      'Not Possible',
    ];
    if (negativeAnswers.includes(input.answer) && !input.comment?.trim()) {
      throw validation('A comment is required for a negative outcome.');
    }

    const oldValue = { answer: target.answer, state: target.state, version: target.version };
    const updater = await updaterName(tx, input.actorId);
    const eventTime = new Date().toISOString();
    await tx.siteStep.update({
      where: { id: target.id },
      data: {
        answer: input.answer,
        comment: input.comment?.trim() || null,
        updatedById: input.actorId,
        version: { increment: 1 },
      },
    });
    const snapshots: StepSnapshot[] = target.workflow.steps.map((item) => ({
      code: item.templateStep.code,
      answer: item.id === target.id ? input.answer : item.answer,
      state: item.state,
      bpMilestoneOverride:
        (item.id === target.id && isPortCheck && milestoneOrder !== undefined) ||
        (!appliesMilestone && item.bpMilestoneOverride),
    }));
    const calculated = recalculate(definition, snapshots);
    await persistStepStates(tx, target, calculated, {
      comment: input.comment?.trim() ?? '',
      updater,
      eventTime,
      milestoneOrder: appliesMilestone ? target.templateStep.displayOrder : milestoneOrder,
    });
    if (calculated.siteStatus === 'COMPLETED' && target.workflow.status !== 'COMPLETED') {
      await queueGroupNotifications(
        tx,
        'SITE_COMPLETED',
        target.workflow.id,
        {
          siteId: target.workflow.site.siteIdText,
          region: target.workflow.site.region.code,
          serviceCenter: target.workflow.site.serviceCenter.code,
          updater,
          eventTime,
          deepLinkTarget: { kind: 'site', publicId: target.workflow.site.publicId },
        },
        'all',
      );
    }
    const requestId = input.requestId ?? randomUUID();
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        entityType: 'site_step',
        entityId: target.id,
        action: appliesMilestone ? 'BP_MILESTONE_APPLIED' : 'STEP_UPDATED',
        oldValue,
        newValue: {
          answer: input.answer,
          state: calculated.steps.find((item) => item.code === target.templateStep.code)?.state,
          ...(appliesMilestone && {
            priorReviewCodes: target.workflow.steps
              .filter(
                (step) =>
                  step.templateStep.displayOrder < target.templateStep.displayOrder &&
                  step.state === 'NEEDS_REVIEW',
              )
              .map((step) => step.templateStep.code),
          }),
        },
        reason: input.comment?.trim() || null,
        requestId,
      },
    });
    return { workflowId: target.workflow.id, siteStatus: calculated.siteStatus, requestId };
  });
}

async function queueGroupNotifications(
  tx: Prisma.TransactionClient,
  type: string,
  reference: string,
  payload: Prisma.InputJsonValue,
  preference: 'escalations' | 'all' = 'escalations',
) {
  const serviceCenter = String((payload as Prisma.InputJsonObject).serviceCenter ?? '');
  const chats = await tx.botChat.findMany({
    where: {
      ...(preference === 'all' ? { active: true } : { active: true, escalations: true }),
      ...(serviceCenter
        ? {
            serviceCenters: { some: { serviceCenter: { code: serviceCenter } } },
          }
        : {}),
    },
  });
  for (const chat of chats) {
    await tx.notification.upsert({
      where: { idempotencyKey: `${type}:${reference}:${chat.id}` },
      update: { payload, state: 'PENDING', nextAttemptAt: new Date() },
      create: {
        idempotencyKey: `${type}:${reference}:${chat.id}`,
        recipientChatId: chat.telegramChatId,
        messageType: type,
        payload,
      },
    });
  }
}

export async function reopenBranch(input: {
  siteStepId: string;
  reason: string;
  actorId: string;
  requestId?: string;
}) {
  if (!input.reason.trim()) throw validation('A reason is required to reopen a branch.');
  return prisma.$transaction(async (tx) => {
    const target = await lockAndLoadStep(tx, input.siteStepId);
    const definition = workflowDefinition(target);
    const milestoneOrder = activeBpMilestoneOrder(target.workflow.steps);
    const reopensPortCheck =
      milestoneOrder !== undefined && target.templateStep.code === PORT_CHECK_STEP_CODE;
    if (
      !reopensPortCheck &&
      isCoveredByBpMilestone(milestoneOrder, target.templateStep.displayOrder)
    ) {
      throw conflict('Reopen the BP milestone before reopening an earlier step.');
    }
    const reopensMilestone =
      milestoneOrder !== undefined && target.templateStep.code === BP_STEP_CODE;
    const descendants = descendantsOf(definition, target.templateStep.code);
    let nextState: StepSnapshot['state'] = 'ACTIONABLE';
    if (reopensMilestone) {
      const applied = await tx.auditEvent.findFirst({
        where: { entityType: 'site_step', entityId: target.id, action: 'BP_MILESTONE_APPLIED' },
        orderBy: { createdAt: 'desc' },
      });
      const history = applied?.newValue;
      const reviewCodes =
        history &&
        typeof history === 'object' &&
        !Array.isArray(history) &&
        Array.isArray(history.priorReviewCodes)
          ? history.priorReviewCodes
          : [];
      const calculated = recalculate(
        definition,
        target.workflow.steps.map((step) => {
          const code = step.templateStep.code;
          const review =
            reviewCodes.includes(code) || (descendants.has(code) && Boolean(step.answer));
          return {
            code,
            answer: step.id === target.id ? null : step.answer,
            state: review ? 'NEEDS_REVIEW' : step.state,
            bpMilestoneOverride: step.bpMilestoneOverride,
          };
        }),
      );
      nextState = calculated.steps.find((step) => step.code === BP_STEP_CODE)!.state;
      await persistStepStates(tx, target, calculated, {
        comment: input.reason.trim(),
        updater: await updaterName(tx, input.actorId),
        eventTime: new Date().toISOString(),
      });
    } else if (reopensPortCheck) {
      const calculated = recalculate(
        definition,
        target.workflow.steps.map((step) => ({
          code: step.templateStep.code,
          answer: step.id === target.id ? null : step.answer,
          state: step.state,
          bpMilestoneOverride: step.id === target.id || step.bpMilestoneOverride,
        })),
      );
      nextState = calculated.steps.find((step) => step.code === PORT_CHECK_STEP_CODE)!.state;
      await persistStepStates(tx, target, calculated, {
        comment: input.reason.trim(),
        updater: await updaterName(tx, input.actorId),
        eventTime: new Date().toISOString(),
        milestoneOrder,
      });
    } else {
      for (const item of target.workflow.steps) {
        if (descendants.has(item.templateStep.code) && item.answer) {
          await tx.siteStep.update({ where: { id: item.id }, data: { state: 'NEEDS_REVIEW' } });
        }
      }
      await tx.siteWorkflow.update({
        where: { id: target.workflow.id },
        data: { status: 'BLOCKED', completedAt: null },
      });
    }
    await tx.siteStep.update({
      where: { id: target.id },
      data: {
        answer: null,
        comment: input.reason,
        state: nextState,
        version: { increment: 1 },
      },
    });
    const requestId = input.requestId ?? randomUUID();
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        entityType: 'site_step',
        entityId: target.id,
        action: reopensMilestone ? 'BP_MILESTONE_REOPENED' : 'BRANCH_REOPENED',
        oldValue: { answer: target.answer, state: target.state },
        newValue: { answer: null, state: nextState },
        reason: input.reason.trim(),
        requestId,
      },
    });
    return { requestId };
  });
}
