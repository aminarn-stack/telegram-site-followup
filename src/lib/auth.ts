import type { FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from './errors.js';

export interface Actor {
  id: string;
  telegramUserId: string;
  role: Role;
  regions: string[];
}

export async function actorFrom(request: FastifyRequest): Promise<Actor> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized();
  }
  return {
    id: request.user.sub,
    telegramUserId: request.user.telegramUserId,
    role: request.user.role,
    regions: request.user.regions,
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
