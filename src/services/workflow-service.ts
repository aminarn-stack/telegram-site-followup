import { randomUUID } from 'node:crypto';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { conflict, forbidden, notFound, validation } from '../lib/errors.js';
import {
  descendantsOf,
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

export async function updateSiteStep(input: StepUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.siteStep.findUnique({
      where: { id: input.siteStepId },
      include: {
        templateStep: true,
        workflow: {
          include: {
            site: { include: { region: true, serviceCenter: true } },
            template: { include: { steps: { orderBy: { displayOrder: 'asc' } } } },
            steps: { include: { templateStep: true } },
          },
        },
      },
    });
    if (!target) throw notFound('Site step not found.');
    if (target.version !== input.expectedVersion) {
      throw conflict('This step was updated by another user. Refresh and try again.', {
        currentVersion: target.version,
      });
    }
    if (target.state === 'LOCKED' || target.state === 'NEEDS_REVIEW') {
      const prerequisite = target.templateStep.prerequisiteCode;
      throw conflict('This step is not actionable.', { unsatisfiedPrerequisite: prerequisite });
    }
    const allowed = target.templateStep.allowedAnswers as string[];
    if (!allowed.includes(input.answer))
      throw validation('The selected answer is not allowed for this step.');
    const definition: TemplateDefinition = {
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
    const descendants = descendantsOf(definition, target.templateStep.code);
    const completedDescendant = target.workflow.steps.some(
      (item) => descendants.has(item.templateStep.code) && item.state === 'COMPLETED',
    );
    if (completedDescendant && target.answer !== input.answer) {
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
    const actor = await tx.user.findUnique({ where: { id: input.actorId } });
    const updater = actor
      ? `${actor.firstName}${actor.lastName ? ` ${actor.lastName}` : ''}`
      : 'Unknown';
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
    }));
    const calculated = recalculate(definition, snapshots);
    for (const item of calculated.steps) {
      const persisted = target.workflow.steps.find(
        (candidate) => candidate.templateStep.code === item.code,
      )!;
      await tx.siteStep.update({ where: { id: persisted.id }, data: { state: item.state } });
      if (item.state === 'BLOCKED') {
        const source =
          item.code === target.templateStep.code ? input.comment?.trim() : persisted.comment;
        const escalation = await tx.escalation.upsert({
          where: { siteStepId: persisted.id },
          create: { siteStepId: persisted.id, reason: source || `Blocked by ${item.code}` },
          update: {
            reason: source || `Blocked by ${item.code}`,
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
          updater,
          eventTime,
          deepLinkTarget: { kind: 'site', publicId: target.workflow.site.publicId },
        });
      } else {
        const open = await tx.escalation.findUnique({ where: { siteStepId: persisted.id } });
        if (open && !open.resolvedAt) {
          await tx.escalation.update({
            where: { id: open.id },
            data: { resolvedAt: new Date(), notificationState: 'PENDING' },
          });
          await queueGroupNotifications(tx, 'RESOLUTION', open.id, {
            siteId: target.workflow.site.siteIdText,
            region: target.workflow.site.region.code,
            serviceCenter: target.workflow.site.serviceCenter.code,
            step: persisted.templateStep.label,
            answer: item.answer,
            updater,
            eventTime,
            deepLinkTarget: { kind: 'site', publicId: target.workflow.site.publicId },
          });
        }
      }
    }
    await tx.siteWorkflow.update({
      where: { id: target.workflow.id },
      data: {
        status: calculated.siteStatus,
        completedAt: calculated.siteStatus === 'COMPLETED' ? new Date() : null,
      },
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
        action: 'STEP_UPDATED',
        oldValue,
        newValue: {
          answer: input.answer,
          state: calculated.steps.find((item) => item.code === target.templateStep.code)?.state,
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
    const target = await tx.siteStep.findUnique({
      where: { id: input.siteStepId },
      include: {
        templateStep: true,
        workflow: {
          include: {
            template: { include: { steps: { orderBy: { displayOrder: 'asc' } } } },
            steps: { include: { templateStep: true } },
          },
        },
      },
    });
    if (!target) throw notFound('Site step not found.');
    const definition: TemplateDefinition = {
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
    const descendants = descendantsOf(definition, target.templateStep.code);
    for (const item of target.workflow.steps) {
      if (descendants.has(item.templateStep.code) && item.answer) {
        await tx.siteStep.update({ where: { id: item.id }, data: { state: 'NEEDS_REVIEW' } });
      }
    }
    await tx.siteStep.update({
      where: { id: target.id },
      data: { answer: null, comment: input.reason, state: 'ACTIONABLE', version: { increment: 1 } },
    });
    await tx.siteWorkflow.update({
      where: { id: target.workflow.id },
      data: { status: 'BLOCKED', completedAt: null },
    });
    const requestId = input.requestId ?? randomUUID();
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        entityType: 'site_step',
        entityId: target.id,
        action: 'BRANCH_REOPENED',
        oldValue: { answer: target.answer, state: target.state },
        newValue: { answer: null, state: 'ACTIONABLE' },
        reason: input.reason.trim(),
        requestId,
      },
    });
    return { requestId };
  });
}
