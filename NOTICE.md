# Notice & attribution

Roster is an original, standalone service. Its design originated as a module I
authored on top of [AFFiNE](https://github.com/toeverything/AFFiNE) (© TOEVERYTHING
PTE. LTD.) for a self-hosted deployment.

**This repository contains no AFFiNE source code.** The module was re-homed into
an independent NestJS application: a fresh Prisma data model, its own
configuration, authentication, queue, scheduler, and GraphQL API. AFFiNE's
platform services (its `Config`, model registry, auth, and job system) were
replaced with the standalone equivalents under `src/`.

AFFiNE is acknowledged here as the original host platform and design context.
No AFFiNE trademark or endorsement is implied.

## Third-party dependencies

This project depends on open-source packages (NestJS, Prisma, Apollo, BullMQ,
date-fns, Zod, and others), each under its own license. Their terms are carried
in `node_modules/*/LICENSE` and the respective `package.json` files.
