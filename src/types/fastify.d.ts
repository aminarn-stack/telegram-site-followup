import '@fastify/jwt';
import type { Role } from '@prisma/client';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      telegramUserId: string;
      role: Role;
      regions: string[];
      serviceCenters: string[];
    };
    user: {
      sub: string;
      telegramUserId: string;
      role: Role;
      regions: string[];
      serviceCenters: string[];
    };
  }
}
