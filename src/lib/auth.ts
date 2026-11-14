import type { FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from './errors.js';

export interface Actor {
  id: string;
  telegramUserId: string;
  role: Role;
  regions: string[];
  serviceCenters: string[];
}

/** Treat JWTs as identity proofs; reload live grants so revocation is immediate. */
export async function actorFrom(request: FastifyRequest): Promise<Actor> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized();
  }

  const userId = request.user.sub;
  if (!userId) throw unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      regions: { include: { region: true } },
      serviceCenters: { include: { serviceCenter: true } },
    },
  });
  if (!user?.active) throw forbidden('Your account access has been revoked or disabled.');

  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    role: user.role,
    regions: user.regions.filter((item) => item.region.active).map((item) => item.region.code),
    serviceCenters: user.serviceCenters
      .filter((item) => item.serviceCenter.active)
      .map((item) => item.serviceCenter.code),
  };
}

export function requireRole(actor: Actor, roles: readonly Role[]): void {
  if (!roles.includes(actor.role)) throw forbidden();
}

export function authorizeRegion(actor: Actor, regionCode: string): void {
  if (actor.role !== 'ADMIN' && !actor.regions.includes(regionCode)) {
    throw forbidden('You do not have access to this region.');
  }
}

export function authorizeServiceCenter(actor: Actor, serviceCenterCode: string): void {
  if (actor.role !== 'ADMIN' && !actor.serviceCenters.includes(serviceCenterCode)) {
    throw forbidden('You do not have access to this service center.');
  }
}
