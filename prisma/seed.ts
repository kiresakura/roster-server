import { PrismaClient } from '@prisma/client';

import { AuthService } from '../src/auth/auth.service';

const prisma = new PrismaClient();

/// Seeds two demo accounts (password: `password123`) so you can log in and
/// exercise the API immediately:
///   supervisor@roster.local  — can approve/reject leave
///   member@roster.local      — a regular team member
async function main(): Promise<void> {
  const passwordHash = AuthService.hashPassword('password123');

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@roster.local' },
    update: {},
    create: {
      email: 'supervisor@roster.local',
      name: 'Sam Supervisor',
      passwordHash,
      pref: { create: { isSupervisor: true } },
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'member@roster.local' },
    update: {},
    create: {
      email: 'member@roster.local',
      name: 'Mia Member',
      passwordHash,
      pref: { create: { isSupervisor: false } },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded users:\n  ${supervisor.email} (supervisor)\n  ${member.email} (member)`);
}

main()
  .catch(e => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
