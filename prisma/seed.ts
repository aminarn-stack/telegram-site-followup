import { PrismaClient, Role, SectorAddition, SiteType } from '@prisma/client';
import { WORKFLOW_TEMPLATES } from '../src/domain/workflow.js';

const prisma = new PrismaClient();

async function backfillActiveWorkflows(
  templateId: string,
  templateStep: { id: string },
  item: { code: string; prerequisiteCode: string | null },
) {
  const activeWorkflows = await prisma.siteWorkflow.findMany({
    where: { templateId, active: true },
    include: {
      steps: { select: { templateStepId: true, answer: true, state: true } },
    },
  });
  for (const workflow of activeWorkflows) {
    const current = workflow.steps.find((step) => step.templateStepId === templateStep.id);
    const allPreviousComplete = workflow.steps
      .filter((step) => step.templateStepId !== templateStep.id)
      .every((step) => step.state === 'COMPLETED' || step.state === 'NOT_APPLICABLE');
    const shouldOpenImplementation =
      item.code === 'SITE_IMPLEMENTATION' && !current?.answer && allPreviousComplete;
    await prisma.siteStep.upsert({
      where: {
        workflowId_templateStepId: {
          workflowId: workflow.id,
          templateStepId: templateStep.id,
        },
      },
      update: shouldOpenImplementation ? { state: 'ACTIONABLE' } : {},
      create: {
        workflowId: workflow.id,
        templateStepId: templateStep.id,
        state: shouldOpenImplementation
          ? 'ACTIONABLE'
          : item.prerequisiteCode
            ? 'LOCKED'
            : 'ACTIONABLE',
      },
    });
    if (shouldOpenImplementation && workflow.status === 'COMPLETED') {
      await prisma.siteWorkflow.update({
        where: { id: workflow.id },
        data: { status: 'IN_PROGRESS', completedAt: null },
      });
    }
  }
}

async function main() {
  for (const definition of WORKFLOW_TEMPLATES) {
    const template = await prisma.workflowTemplate.upsert({
      where: { code_version: { code: definition.code, version: definition.version } },
      update: { active: true },
      create: {
        code: definition.code,
        version: definition.version,
        siteType: definition.siteType as SiteType,
        sectorAddition: definition.sectorAddition as SectorAddition,
      },
    });
    for (const item of definition.steps) {
      const templateStep = await prisma.workflowTemplateStep.upsert({
        where: { templateId_code: { templateId: template.id, code: item.code } },
        update: {
          displayOrder: item.order,
          label: item.label,
          prerequisiteCode: item.prerequisiteCode,
          stepType: item.type,
          allowedAnswers: [...item.answers],
        },
        create: {
          templateId: template.id,
          code: item.code,
          displayOrder: item.order,
          label: item.label,
          prerequisiteCode: item.prerequisiteCode,
          stepType: item.type,
          allowedAnswers: [...item.answers],
        },
      });
      await backfillActiveWorkflows(template.id, templateStep, item);
    }
  }

  const activeTemplates = await prisma.workflowTemplate.findMany({
    where: { active: true },
    include: { steps: true },
  });
  for (const template of activeTemplates) {
    if (template.steps.some((item) => item.code === 'SITE_IMPLEMENTATION')) continue;
    const canonical = WORKFLOW_TEMPLATES.find(
      (item) =>
        item.siteType === template.siteType && item.sectorAddition === template.sectorAddition,
    );
    const finalStep = canonical?.steps.find((item) => item.code === 'SITE_IMPLEMENTATION');
    if (!finalStep) continue;
    const templateStep = await prisma.workflowTemplateStep.create({
      data: {
        templateId: template.id,
        code: finalStep.code,
        displayOrder: Math.max(0, ...template.steps.map((item) => item.displayOrder)) + 1,
        label: finalStep.label,
        prerequisiteCode: finalStep.prerequisiteCode,
        stepType: finalStep.type,
        allowedAnswers: [...finalStep.answers],
      },
    });
    await backfillActiveWorkflows(template.id, templateStep, finalStep);
  }

  const adminTelegramId = BigInt(process.env.DEFAULT_ADMIN_TELEGRAM_ID ?? '100000001');
  await prisma.user.upsert({
    where: { telegramUserId: adminTelegramId },
    update: { active: true, role: Role.ADMIN },
    create: {
      telegramUserId: adminTelegramId,
      firstName: process.env.DEFAULT_ADMIN_NAME ?? 'Development Administrator',
      role: Role.ADMIN,
    },
  });

  await prisma.appConfig.upsert({
    where: { key: 'timezone' },
    update: {},
    create: { key: 'timezone', value: process.env.APP_TIMEZONE ?? 'Asia/Tehran' },
  });
  await prisma.appConfig.upsert({
    where: { key: 'importValueMappings' },
    update: {},
    create: {
      key: 'importValueMappings',
      value: {
        siteType: {
          normal: 'NORMAL',
          'normal site': 'NORMAL',
          shared: 'SHARED',
          'shared site': 'SHARED',
        },
        sector: { yes: 'YES', included: 'YES', no: 'NO', 'not included': 'NO' },
      },
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
