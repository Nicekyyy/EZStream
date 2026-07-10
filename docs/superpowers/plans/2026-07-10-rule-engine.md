# Rule Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded "every chat message → TTS" automation with a full rule engine: creators define rules (trigger event types, nested AND/OR conditions, ordered actions with cooldown/timing) that control alerts, sounds, images, text, goals, event lists and TTS — and wire real TikTok gift/follow/like/share/subscribe events into the pipeline so rules have something besides chat to react to.

**Architecture:** A new `apps/api/src/rules/` Nest module owns a `Rule` Prisma model, a pure-function condition evaluator, and a `RuleEngineService` that `LiveEventsService.processEvent` calls instead of its old hardcoded TTS branch. Non-TTS actions reuse the existing `WidgetAction` → `InMemoryQueue` → `WidgetState` → Socket.IO pipeline (already built for `testTrigger`); TTS actions reuse the existing `TtsJob` pipeline. The dashboard gets a new `/dashboard/rules` list + editor with a recursive condition builder, an action list editor, and a server-side dry-run test panel.

**Tech Stack:** NestJS 11 + Prisma (SQLite) + class-validator on the backend, Next.js 15 App Router + React 19 on the frontend, Vitest (new to this repo) for the pure evaluator logic.

## Global Constraints

- ESM everywhere: relative imports in `.ts` files MUST include the `.js` extension (e.g. `./rule-evaluator.js`), even though the source file is `.ts`.
- Follow existing module conventions exactly: one `<name>.module.ts` / `<name>.controller.ts` / `<name>.service.ts` per domain, `@Inject(Xyz) private readonly xyz: Xyz` constructor injection, DTOs as local classes in the controller file using `class-validator`.
- The global `ValidationPipe` in `apps/api/src/main.ts` is `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` — request bodies with unknown fields are **rejected with a 400**, not silently stripped. Never send extra fields (like `id`, `createdAt`) in a POST/PATCH body.
- `/rules` is already listed in `main.ts`'s `apiRoutes` bypass array for the static-file-serving middleware — no change needed there.
- This repo has **no existing test framework** except what this plan adds (Vitest, scoped to `apps/api`, only for the pure evaluator in `rule-evaluator.ts`). Controllers, services, and React components are verified by `pnpm typecheck` / `pnpm build` and manual exercise via the dev server, matching how every other module in this codebase is verified — do not invent test infrastructure beyond what's specified below.
- Widget config / rule config values coming from Prisma `Json` columns are untyped at runtime — always guard with `typeof`/`Array.isArray` before use, matching the existing style in `queues.service.ts` and `live-events.service.ts`.
- Thai-language UI strings throughout the dashboard — match existing copy style (see `apps/web/app/dashboard/widgets/page.tsx`) for any new UI text.
- Do not touch `apps/web/components/widget-renderer.tsx`'s chat widget rendering, TikTok/YouTube/Twitch connector logic beyond the specific listeners added in Task 15, or any config option not named in this plan — stay scoped to what's listed.

---

## Task 1: Prisma schema — add the `Rule` model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `Rule` with fields `id, creatorId, name, isEnabled, priority, stopOnMatch, eventTypes (Json), conditions (Json), actions (Json), cooldownSeconds, cooldownScope, activeFrom, activeTo, lastFiredAt, createdAt, updatedAt`, relation `creator Creator`. `Creator.rules Rule[]` relation added. Regenerated `@prisma/client` exports `Prisma.Rule`, `Prisma.RuleUpdateInput`, etc., used by every later backend task.

- [ ] **Step 1: Add the `rules` relation to `Creator`**

In `packages/db/prisma/schema.prisma`, find the `Creator` model (starts at the line `model Creator {`) and add `rules Rule[]` to its relations, right after `widgets Widget[]`:

```prisma
model Creator {
  id          String   @id @default(cuid())
  userId      String   @unique
  displayName String
  slug        String   @unique
  bio         String?
  settings    Json     @default(dbgenerated("'{}'"))
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  overlays      Overlay[]
  widgets       Widget[]
  rules         Rule[]
  eventLogs     EventLog[]
  widgetActions WidgetAction[]
  ttsJobs       TtsJob[]
  mediaAssets   MediaAsset[]
  apiTokens     ApiToken[]
  liveSessions  LiveSession[]
  auditLogs     AuditLog[]
  chatSources   ChatSource[]
}
```

- [ ] **Step 2: Add the `Rule` model**

In the same file, after the `ChatSource` model (the last model in the file), add:

```prisma
model Rule {
  id              String    @id @default(cuid())
  creatorId       String
  name            String
  isEnabled       Boolean   @default(true)
  priority        Int       @default(0)
  stopOnMatch     Boolean   @default(false)
  eventTypes      Json
  conditions      Json      @default(dbgenerated("'{\"all\":[]}'"))
  actions         Json      @default(dbgenerated("'[]'"))
  cooldownSeconds Int       @default(0)
  cooldownScope   String    @default("rule")
  activeFrom      String?
  activeTo        String?
  lastFiredAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  creator Creator @relation(fields: [creatorId], references: [id], onDelete: Cascade)

  @@index([creatorId])
}
```

- [ ] **Step 3: Push the schema and regenerate the client**

Run from the repo root:

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: both commands exit 0. `pnpm db:migrate` runs `prisma db push --accept-data-loss` and prints `Your database is now in sync with your Prisma schema.` (there is no migration-file history in this repo — see `CLAUDE.md`).

- [ ] **Step 4: Verify the generated client has the new types**

```bash
node -e "const { Prisma } = require('@prisma/client'); console.log(typeof Prisma.RuleScalarFieldEnum)"
```

Expected: prints `object` (run from `packages/db`, or adjust the require path — the important thing is confirming `@prisma/client`'s generated output now includes `Rule`).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "db: add Rule model for the rule engine"
```

---

## Task 2: Shared types — condition/action types, `RANDOM` action, moved template helpers

**Files:**
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `ruleActionTypes` now includes `"RANDOM"`; exported `RuleAction` type; exported pure functions `getPathValue(payload, path): unknown` and `renderTemplate(template, payload): string`. These are consumed by `apps/api/src/rules/rule-evaluator.ts` (Task 4), `apps/api/src/rules/rule-engine.service.ts` (Task 8), and `apps/api/src/live-events/live-events.service.ts` (Task 10).

- [ ] **Step 1: Add `RANDOM` to `ruleActionTypes` and export the `RuleAction` type**

In `packages/shared/src/index.ts`, replace:

```ts
export const ruleActionTypes = [
  "TRIGGER_WIDGET",
  "SHOW_ALERT",
  "PLAY_SOUND",
  "SPEAK_TTS",
  "UPDATE_GOAL",
  "APPEND_EVENT_LIST",
  "SHOW_IMAGE",
  "UPDATE_TEXT"
] as const;

export type RuleActionType = (typeof ruleActionTypes)[number];
```

with:

```ts
export const ruleActionTypes = [
  "TRIGGER_WIDGET",
  "SHOW_ALERT",
  "PLAY_SOUND",
  "SPEAK_TTS",
  "UPDATE_GOAL",
  "APPEND_EVENT_LIST",
  "SHOW_IMAGE",
  "UPDATE_TEXT",
  "RANDOM"
] as const;

export type RuleActionType = (typeof ruleActionTypes)[number];

export type RuleAction = {
  type: RuleActionType;
  widgetId?: string;
  mediaAssetId?: string;
  textTemplate?: string;
  durationMs?: number;
  amount?: number | string;
  pick?: number;
  actions?: RuleAction[];
};
```

- [ ] **Step 2: Move `getPathValue` and `renderTemplate` into shared**

In the same file, add these exports near the bottom (after `sanitizeTtsText`, before the `chatPlatforms` section):

```ts
export function getPathValue(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

export function renderTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, path: string) => {
    const value = getPathValue(payload, path);
    return value === undefined || value === null ? "" : String(value);
  });
}
```

- [ ] **Step 3: Typecheck the shared package**

```bash
pnpm --filter @ezstream/shared typecheck
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "shared: add RANDOM action type, RuleAction type, move template helpers"
```

---

## Task 3: Vitest scaffolding for `apps/api`

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`

**Interfaces:**
- Produces: `pnpm --filter @ezstream/api test` runs Vitest against `src/**/*.test.ts`. Consumed by Task 4's `rule-evaluator.test.ts`.

- [ ] **Step 1: Add the `vitest` devDependency and `test` script**

In `apps/api/package.json`, add `"test": "vitest run"` to `scripts`, and `"vitest": "^3.0.0"` to `devDependencies`:

```json
{
  "name": "@ezstream/api",
  "version": "0.1.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "dotenv -e ../../.env -- tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/apps/api/src/main.js",
    "lint": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@ezstream/db": "workspace:*",
    "@ezstream/shared": "workspace:*",
    "@nestjs/common": "^11.1.2",
    "@nestjs/config": "^4.0.2",
    "@nestjs/core": "^11.1.2",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/platform-express": "^11.1.2",
    "@nestjs/platform-socket.io": "^11.1.2",
    "@nestjs/throttler": "^6.4.0",
    "@nestjs/websockets": "^11.1.2",
    "@prisma/client": "^6.8.2",
    "bcryptjs": "^2.4.3",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.2",
    "express": "^5.1.0",
    "ioredis": "^5.6.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "tiktok-live-connector": "2.1.1-beta1",
    "tmi.js": "^1.8.5",
    "youtubei.js": "^17.0.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/express": "^5.0.2",
    "@types/multer": "^2.1.0",
    "@types/tmi.js": "^1.8.6",
    "dotenv-cli": "^8.0.0",
    "socket.io": "^4.8.1",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create the Vitest config**

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"]
  }
});
```

- [ ] **Step 3: Install and verify Vitest runs (with no test files yet)**

```bash
pnpm install
pnpm --filter @ezstream/api test
```

Expected: Vitest reports `No test files found` (exit code may be non-zero for zero matched tests — that's expected at this point; Task 4 adds the first test file).

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/vitest.config.ts pnpm-lock.yaml
git commit -m "api: add vitest for pure-function unit tests"
```

---

## Task 4: `rule-evaluator.ts` — pure condition evaluator (TDD)

**Files:**
- Create: `apps/api/src/rules/rule-evaluator.ts`
- Test: `apps/api/src/rules/rule-evaluator.test.ts`

**Interfaces:**
- Consumes: `getPathValue` from `@ezstream/shared` (Task 2).
- Produces: types `ConditionLeaf`, `ConditionGroup`, `ConditionNode`, `ConditionTrace`; functions `evaluateConditions(node, payload, depth?): boolean`, `evaluateConditionsWithTrace(node, payload, depth?): { passed: boolean; trace: ConditionTrace[] }`, `pickRandom<T>(items: T[], count: number): T[]`. Consumed by `rules-validation.ts` (Task 5), `rules.service.ts` (Task 6), `rule-engine.service.ts` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/rules/rule-evaluator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateConditions, evaluateConditionsWithTrace, pickRandom, type ConditionNode } from "./rule-evaluator.js";

describe("evaluateConditions", () => {
  it("matches an empty all-group unconditionally", () => {
    expect(evaluateConditions({ all: [] }, { anything: 1 })).toBe(true);
  });

  it("evaluates equals case-insensitively", () => {
    const node: ConditionNode = { field: "giftName", operator: "equals", value: "Rose" };
    expect(evaluateConditions(node, { giftName: "rose" })).toBe(true);
    expect(evaluateConditions(node, { giftName: "Lion" })).toBe(false);
  });

  it("evaluates notEquals", () => {
    const node: ConditionNode = { field: "giftName", operator: "notEquals", value: "Rose" };
    expect(evaluateConditions(node, { giftName: "Lion" })).toBe(true);
    expect(evaluateConditions(node, { giftName: "Rose" })).toBe(false);
  });

  it("evaluates contains and notContains case-insensitively", () => {
    const contains: ConditionNode = { field: "message", operator: "contains", value: "hello" };
    expect(evaluateConditions(contains, { message: "well HELLO there" })).toBe(true);
    expect(evaluateConditions(contains, { message: "goodbye" })).toBe(false);

    const notContains: ConditionNode = { field: "message", operator: "notContains", value: "hello" };
    expect(evaluateConditions(notContains, { message: "goodbye" })).toBe(true);
  });

  it("evaluates numeric comparisons, coercing numeric strings", () => {
    expect(evaluateConditions({ field: "coins", operator: "greaterThan", value: 50 }, { coins: 100 })).toBe(true);
    expect(evaluateConditions({ field: "coins", operator: "greaterThan", value: 50 }, { coins: "40" })).toBe(false);
    expect(evaluateConditions({ field: "coins", operator: "greaterThanOrEqual", value: 100 }, { coins: 100 })).toBe(true);
    expect(evaluateConditions({ field: "coins", operator: "lessThan", value: 50 }, { coins: 10 })).toBe(true);
    expect(evaluateConditions({ field: "coins", operator: "lessThanOrEqual", value: 10 }, { coins: 10 })).toBe(true);
  });

  it("evaluates exists", () => {
    expect(evaluateConditions({ field: "username", operator: "exists", value: null }, { username: "a" })).toBe(true);
    expect(evaluateConditions({ field: "username", operator: "exists", value: null }, {})).toBe(false);
  });

  it("evaluates in against a comma string or an array", () => {
    const csv: ConditionNode = { field: "giftName", operator: "in", value: "Rose, Lion, Universe" };
    expect(evaluateConditions(csv, { giftName: "lion" })).toBe(true);
    expect(evaluateConditions(csv, { giftName: "Panda" })).toBe(false);

    const arr: ConditionNode = { field: "giftName", operator: "in", value: ["Rose", "Lion"] };
    expect(evaluateConditions(arr, { giftName: "Rose" })).toBe(true);
  });

  it("resolves dot-path fields", () => {
    const node: ConditionNode = { field: "user.badges.0", operator: "equals", value: "vip" };
    expect(evaluateConditions(node, { user: { badges: ["vip"] } })).toBe(true);
  });

  it("combines nested all/any groups", () => {
    const node: ConditionNode = {
      all: [
        { field: "giftName", operator: "equals", value: "Rose" },
        {
          any: [
            { field: "repeatCount", operator: "greaterThanOrEqual", value: 5 },
            { field: "coins", operator: "greaterThanOrEqual", value: 100 }
          ]
        }
      ]
    };
    expect(evaluateConditions(node, { giftName: "Rose", repeatCount: 1, coins: 100 })).toBe(true);
    expect(evaluateConditions(node, { giftName: "Rose", repeatCount: 1, coins: 10 })).toBe(false);
    expect(evaluateConditions(node, { giftName: "Lion", repeatCount: 10, coins: 100 })).toBe(false);
  });

  it("stops recursing past the max depth and treats it as non-matching", () => {
    let node: ConditionNode = { field: "x", operator: "equals", value: 1 };
    for (let i = 0; i < 12; i++) node = { all: [node] };
    expect(evaluateConditions(node, { x: 1 })).toBe(false);
  });
});

describe("evaluateConditionsWithTrace", () => {
  it("returns a trace entry per leaf with pass/fail", () => {
    const node: ConditionNode = {
      all: [
        { field: "giftName", operator: "equals", value: "Rose" },
        { field: "coins", operator: "greaterThanOrEqual", value: 100 }
      ]
    };
    const { passed, trace } = evaluateConditionsWithTrace(node, { giftName: "Rose", coins: 10 });
    expect(passed).toBe(false);
    expect(trace).toHaveLength(2);
    expect(trace[0]).toMatchObject({ field: "giftName", passed: true });
    expect(trace[1]).toMatchObject({ field: "coins", passed: false, actual: 10 });
  });
});

describe("pickRandom", () => {
  it("returns at most `count` distinct items from the pool", () => {
    const items = [1, 2, 3, 4, 5];
    const picked = pickRandom(items, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    for (const item of picked) expect(items).toContain(item);
  });

  it("clamps count to the pool size and to zero", () => {
    expect(pickRandom([1, 2], 10)).toHaveLength(2);
    expect(pickRandom([1, 2], -1)).toHaveLength(0);
    expect(pickRandom([], 3)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @ezstream/api test
```

Expected: FAIL — `Cannot find module './rule-evaluator.js'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `rule-evaluator.ts`**

Create `apps/api/src/rules/rule-evaluator.ts`:

```ts
import { getPathValue, type ConditionOperator } from "@ezstream/shared";

export type ConditionLeaf = { field: string; operator: ConditionOperator; value: unknown };
export type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };
export type ConditionNode = ConditionLeaf | ConditionGroup;

export type ConditionTrace = {
  field: string;
  operator: ConditionOperator;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

const MAX_DEPTH = 8;

function isLeaf(node: ConditionNode): node is ConditionLeaf {
  return typeof (node as ConditionLeaf).field === "string";
}

function normalizeForCompare(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function compare(operator: ConditionOperator, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return normalizeForCompare(actual) === normalizeForCompare(expected);
    case "notEquals":
      return normalizeForCompare(actual) !== normalizeForCompare(expected);
    case "contains":
      return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "notContains":
      return !String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "greaterThan":
      return toNumber(actual) > toNumber(expected);
    case "greaterThanOrEqual":
      return toNumber(actual) >= toNumber(expected);
    case "lessThan":
      return toNumber(actual) < toNumber(expected);
    case "lessThanOrEqual":
      return toNumber(actual) <= toNumber(expected);
    case "exists":
      return actual !== undefined && actual !== null;
    case "in": {
      const list = Array.isArray(expected)
        ? expected
        : String(expected ?? "").split(",").map((item) => item.trim()).filter(Boolean);
      return list.some((item) => normalizeForCompare(item) === normalizeForCompare(actual));
    }
    default:
      return false;
  }
}

export function evaluateConditions(node: ConditionNode, payload: Record<string, unknown>, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (isLeaf(node)) {
    return compare(node.operator, getPathValue(payload, node.field), node.value);
  }
  if ("all" in node) {
    return node.all.every((child) => evaluateConditions(child, payload, depth + 1));
  }
  return node.any.some((child) => evaluateConditions(child, payload, depth + 1));
}

export function evaluateConditionsWithTrace(
  node: ConditionNode,
  payload: Record<string, unknown>,
  depth = 0
): { passed: boolean; trace: ConditionTrace[] } {
  if (depth > MAX_DEPTH) return { passed: false, trace: [] };
  if (isLeaf(node)) {
    const actual = getPathValue(payload, node.field);
    const passed = compare(node.operator, actual, node.value);
    return { passed, trace: [{ field: node.field, operator: node.operator, expected: node.value, actual, passed }] };
  }
  const children = "all" in node ? node.all : node.any;
  const results = children.map((child) => evaluateConditionsWithTrace(child, payload, depth + 1));
  const trace = results.flatMap((result) => result.trace);
  const passed = "all" in node ? results.every((result) => result.passed) : results.some((result) => result.passed);
  return { passed, trace };
}

export function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const n = Math.max(0, Math.min(count, pool.length));
  for (let i = 0; i < n; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @ezstream/api test
```

Expected: PASS — all `describe` blocks green, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rules/rule-evaluator.ts apps/api/src/rules/rule-evaluator.test.ts
git commit -m "api: add pure rule condition evaluator with tests"
```

---

## Task 5: `rules-validation.ts` — runtime validation for condition trees and actions

**Files:**
- Create: `apps/api/src/rules/rules-validation.ts`

**Interfaces:**
- Consumes: `conditionOperators`, `ruleActionTypes`, `RuleAction`, `RuleActionType` from `@ezstream/shared`; `ConditionNode` from `./rule-evaluator.js` (Task 4).
- Produces: `validateEventTypes(value: unknown): string[]`, `validateConditionTree(node: unknown, depth?: number): ConditionNode`, `validateActions(actions: unknown, depth?: number): RuleAction[]`, `validateActiveTime(value: unknown, label: string): string | null`. Consumed by `rules.service.ts` (Task 6).

- [ ] **Step 1: Implement the file**

Create `apps/api/src/rules/rules-validation.ts`:

```ts
import { BadRequestException } from "@nestjs/common";
import { conditionOperators, ruleActionTypes, type ConditionOperator, type RuleAction, type RuleActionType } from "@ezstream/shared";
import type { ConditionNode } from "./rule-evaluator.js";

const MAX_CONDITION_DEPTH = 8;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateEventTypes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new BadRequestException("eventTypes must be a non-empty array of strings");
  }
  return value;
}

export function validateConditionTree(node: unknown, depth = 0): ConditionNode {
  if (depth > MAX_CONDITION_DEPTH) throw new BadRequestException("Condition tree is too deeply nested");
  if (!node || typeof node !== "object") throw new BadRequestException("Invalid condition node");
  const value = node as Record<string, unknown>;

  if ("field" in value) {
    if (typeof value.field !== "string" || !value.field.trim()) {
      throw new BadRequestException("Condition field must be a non-empty string");
    }
    if (!conditionOperators.includes(value.operator as ConditionOperator)) {
      throw new BadRequestException(`Unknown operator: ${String(value.operator)}`);
    }
    return { field: value.field, operator: value.operator as ConditionOperator, value: value.value };
  }
  if (Array.isArray(value.all)) {
    return { all: value.all.map((child) => validateConditionTree(child, depth + 1)) };
  }
  if (Array.isArray(value.any)) {
    return { any: value.any.map((child) => validateConditionTree(child, depth + 1)) };
  }
  throw new BadRequestException("Condition node must have field/operator, or an all[]/any[] group");
}

export function validateActions(actions: unknown, depth = 0): RuleAction[] {
  if (!Array.isArray(actions)) throw new BadRequestException("actions must be an array");
  return actions.map((action) => validateAction(action, depth));
}

function validateAction(action: unknown, depth: number): RuleAction {
  if (!action || typeof action !== "object") throw new BadRequestException("Invalid action");
  const value = action as Record<string, unknown>;
  if (!ruleActionTypes.includes(value.type as RuleActionType)) {
    throw new BadRequestException(`Unknown action type: ${String(value.type)}`);
  }
  const type = value.type as RuleActionType;

  if (type === "RANDOM") {
    if (depth > 0) throw new BadRequestException("RANDOM action groups cannot be nested");
    const children = validateActions(value.actions, depth + 1);
    return {
      type,
      pick: typeof value.pick === "number" && value.pick > 0 ? value.pick : 1,
      actions: children
    };
  }

  return {
    type,
    widgetId: typeof value.widgetId === "string" ? value.widgetId : undefined,
    mediaAssetId: typeof value.mediaAssetId === "string" ? value.mediaAssetId : undefined,
    textTemplate: typeof value.textTemplate === "string" ? value.textTemplate : undefined,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : undefined,
    amount: typeof value.amount === "number" || typeof value.amount === "string" ? value.amount : undefined
  };
}

export function validateActiveTime(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !timePattern.test(value)) {
    throw new BadRequestException(`${label} must be in HH:mm format`);
  }
  return value;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @ezstream/api typecheck
```

Expected: exits 0. (It's expected to still fail at this point only if Task 4's files have an issue — `rules-validation.ts` itself has no other dependencies yet.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/rules/rules-validation.ts
git commit -m "api: add rule condition/action validation helpers"
```

---

## Task 6: `rules.service.ts` — CRUD, ownership validation, dry-run

**Files:**
- Create: `apps/api/src/rules/rules.service.ts`

**Interfaces:**
- Consumes: `PrismaService` (existing), `RuleEngineService.invalidate(creatorId)` (Task 8 — this task references it now; Task 8 must exist before this compiles, so implement Task 8's `invalidate` method signature first if executing out of order — the plan executes Tasks in listed order, and Task 8 comes after this one, so this file will not typecheck standalone until Task 8 exists; that's expected, verify at the end of Task 8 instead), `evaluateConditionsWithTrace` + `ConditionNode` from `./rule-evaluator.js`, `validateActions`/`validateActiveTime`/`validateConditionTree`/`validateEventTypes` from `./rules-validation.js`, `RuleAction` from `@ezstream/shared`.
- Produces: `RulesService` with `list(creatorId)`, `getOwned(id, creatorId)`, `create(creatorId, dto)`, `update(id, creatorId, dto)`, `remove(id, creatorId)`, `dryRun(id, creatorId, eventType, payload)`. Consumed by `rules.controller.ts` (Task 7).

- [ ] **Step 1: Implement the file**

Create `apps/api/src/rules/rules.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { RuleAction } from "@ezstream/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { RuleEngineService } from "./rule-engine.service.js";
import { evaluateConditionsWithTrace, type ConditionNode } from "./rule-evaluator.js";
import { validateActions, validateActiveTime, validateConditionTree, validateEventTypes } from "./rules-validation.js";

type RuleInput = {
  name: string;
  isEnabled?: boolean;
  priority?: number;
  stopOnMatch?: boolean;
  eventTypes: unknown;
  conditions?: unknown;
  actions?: unknown;
  cooldownSeconds?: number;
  cooldownScope?: string;
  activeFrom?: string | null;
  activeTo?: string | null;
};

const ACTION_WIDGET_TYPE: Partial<Record<string, string>> = {
  SHOW_ALERT: "ALERT_WIDGET",
  SPEAK_TTS: "TTS_WIDGET",
  PLAY_SOUND: "SOUND_WIDGET",
  SHOW_IMAGE: "IMAGE_WIDGET",
  UPDATE_TEXT: "TEXT_WIDGET",
  UPDATE_GOAL: "GOAL_WIDGET",
  APPEND_EVENT_LIST: "EVENT_LIST_WIDGET"
};

@Injectable()
export class RulesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuleEngineService) private readonly ruleEngine: RuleEngineService
  ) {}

  list(creatorId: string) {
    return this.prisma.rule.findMany({ where: { creatorId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  }

  async getOwned(id: string, creatorId: string) {
    const rule = await this.prisma.rule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Rule not found");
    if (rule.creatorId !== creatorId) throw new ForbiddenException("Rule does not belong to creator");
    return rule;
  }

  async create(creatorId: string, dto: RuleInput) {
    if (!dto.name?.trim()) throw new BadRequestException("name is required");
    const eventTypes = validateEventTypes(dto.eventTypes);
    const conditions = validateConditionTree(dto.conditions ?? { all: [] });
    const actions = validateActions(dto.actions ?? []);
    await this.validateReferences(creatorId, actions);
    const activeFrom = validateActiveTime(dto.activeFrom, "activeFrom");
    const activeTo = validateActiveTime(dto.activeTo, "activeTo");

    const created = await this.prisma.rule.create({
      data: {
        creatorId,
        name: dto.name.trim(),
        isEnabled: dto.isEnabled ?? true,
        priority: dto.priority ?? 0,
        stopOnMatch: dto.stopOnMatch ?? false,
        eventTypes: eventTypes as Prisma.InputJsonValue,
        conditions: conditions as unknown as Prisma.InputJsonValue,
        actions: actions as unknown as Prisma.InputJsonValue,
        cooldownSeconds: dto.cooldownSeconds ?? 0,
        cooldownScope: dto.cooldownScope === "user" ? "user" : "rule",
        activeFrom,
        activeTo
      }
    });
    this.ruleEngine.invalidate(creatorId);
    return created;
  }

  async update(id: string, creatorId: string, dto: Partial<RuleInput>) {
    await this.getOwned(id, creatorId);
    const data: Prisma.RuleUpdateInput = {};

    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException("name is required");
      data.name = dto.name.trim();
    }
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.stopOnMatch !== undefined) data.stopOnMatch = dto.stopOnMatch;
    if (dto.eventTypes !== undefined) data.eventTypes = validateEventTypes(dto.eventTypes) as Prisma.InputJsonValue;
    if (dto.conditions !== undefined) {
      data.conditions = validateConditionTree(dto.conditions) as unknown as Prisma.InputJsonValue;
    }
    if (dto.actions !== undefined) {
      const actions = validateActions(dto.actions);
      await this.validateReferences(creatorId, actions);
      data.actions = actions as unknown as Prisma.InputJsonValue;
    }
    if (dto.cooldownSeconds !== undefined) data.cooldownSeconds = dto.cooldownSeconds;
    if (dto.cooldownScope !== undefined) data.cooldownScope = dto.cooldownScope === "user" ? "user" : "rule";
    if (dto.activeFrom !== undefined) data.activeFrom = validateActiveTime(dto.activeFrom, "activeFrom");
    if (dto.activeTo !== undefined) data.activeTo = validateActiveTime(dto.activeTo, "activeTo");

    const updated = await this.prisma.rule.update({ where: { id }, data });
    this.ruleEngine.invalidate(creatorId);
    return updated;
  }

  async remove(id: string, creatorId: string) {
    await this.getOwned(id, creatorId);
    await this.prisma.rule.delete({ where: { id } });
    this.ruleEngine.invalidate(creatorId);
    return { deleted: true };
  }

  async dryRun(id: string, creatorId: string, eventType: string, payload: Record<string, unknown>) {
    const rule = await this.getOwned(id, creatorId);
    const eventTypes = Array.isArray(rule.eventTypes) ? (rule.eventTypes as unknown[]) : [];
    const eventTypeMatches = eventTypes.includes(eventType);
    const conditions = (rule.conditions ?? { all: [] }) as ConditionNode;
    const { passed, trace } = evaluateConditionsWithTrace(conditions, payload);
    return { eventTypeMatches, matched: eventTypeMatches && passed, trace };
  }

  private async validateReferences(creatorId: string, actions: RuleAction[]) {
    for (const action of this.flattenActions(actions)) {
      const isTts = action.type === "SPEAK_TTS";
      const expectedType = isTts ? "TTS_WIDGET" : ACTION_WIDGET_TYPE[action.type];
      if (expectedType) {
        if (!action.widgetId) throw new BadRequestException(`Action ${action.type} requires widgetId`);
        const widget = await this.prisma.widget.findFirst({ where: { id: action.widgetId, creatorId } });
        if (!widget) throw new BadRequestException(`Widget ${action.widgetId} not found for this creator`);
        if (widget.type !== expectedType) {
          throw new BadRequestException(`Action ${action.type} requires a ${expectedType}, but widget ${action.widgetId} is ${widget.type}`);
        }
      }
      if (action.mediaAssetId) {
        const asset = await this.prisma.mediaAsset.findFirst({ where: { id: action.mediaAssetId, creatorId } });
        if (!asset) throw new BadRequestException(`Media asset ${action.mediaAssetId} not found for this creator`);
      }
    }
  }

  private flattenActions(actions: RuleAction[]): RuleAction[] {
    return actions.flatMap((action) => (action.type === "RANDOM" ? this.flattenActions(action.actions ?? []) : [action]));
  }
}
```

- [ ] **Step 2: Commit (typecheck happens at the end of Task 8, once `RuleEngineService` exists)**

```bash
git add apps/api/src/rules/rules.service.ts
git commit -m "api: add RulesService with CRUD, ownership validation, dry-run"
```

---

## Task 7: `rules.controller.ts` — REST endpoints + DTOs

**Files:**
- Create: `apps/api/src/rules/rules.controller.ts`

**Interfaces:**
- Consumes: `RulesService` (Task 6), `JwtAuthGuard`, `CurrentUser`/`AuthUser` (existing, from `widgets.controller.ts` pattern).
- Produces: `GET/POST /rules`, `GET/PATCH/DELETE /rules/:id`, `POST /rules/:id/test`. Consumed by `rules.module.ts` (Task 9) and the frontend (Tasks 19-20).

- [ ] **Step 1: Implement the file**

Create `apps/api/src/rules/rules.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Min } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { RulesService } from "./rules.service.js";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

class CreateRuleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  stopOnMatch?: boolean;

  @IsArray()
  eventTypes!: string[];

  @IsOptional()
  @IsObject()
  conditions?: object;

  @IsOptional()
  @IsArray()
  actions?: object[];

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsIn(["rule", "user"])
  cooldownScope?: string;

  @IsOptional()
  @Matches(timePattern)
  activeFrom?: string;

  @IsOptional()
  @Matches(timePattern)
  activeTo?: string;
}

class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  stopOnMatch?: boolean;

  @IsOptional()
  @IsArray()
  eventTypes?: string[];

  @IsOptional()
  @IsObject()
  conditions?: object;

  @IsOptional()
  @IsArray()
  actions?: object[];

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsIn(["rule", "user"])
  cooldownScope?: string;

  @IsOptional()
  activeFrom?: string | null;

  @IsOptional()
  activeTo?: string | null;
}

class TestRuleDto {
  @IsString()
  eventType!: string;

  @IsObject()
  payload!: object;
}

@Controller("rules")
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.rules.list(user.creatorId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRuleDto) {
    return this.rules.create(user.creatorId!, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rules.getOwned(id, user.creatorId!);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRuleDto) {
    return this.rules.update(id, user.creatorId!, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rules.remove(id, user.creatorId!);
  }

  @Post(":id/test")
  test(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: TestRuleDto) {
    return this.rules.dryRun(id, user.creatorId!, dto.eventType, dto.payload as Record<string, unknown>);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/rules/rules.controller.ts
git commit -m "api: add RulesController with CRUD and dry-run test endpoint"
```

---

## Task 8: `rule-engine.service.ts` — orchestration (cache, cooldown, timing, action dispatch)

**Files:**
- Create: `apps/api/src/rules/rule-engine.service.ts`

**Interfaces:**
- Consumes: `PrismaService`, `QueuesService` (`queues.widgetActions.add`, `queues.ttsJobs.add` — existing), `REDIS`/`Redis` (existing), `evaluateConditions`/`pickRandom`/`ConditionNode` from `./rule-evaluator.js` (Task 4), `renderTemplate`/`resolveGoogleTtsVoiceName`/`defaultGoogleTtsVoiceName`/`sanitizeTtsText`/`RuleAction` from `@ezstream/shared`.
- Produces: `RuleEngineService` with `invalidate(creatorId: string): void` (consumed by `rules.service.ts`, Task 6) and `evaluate(creatorId, eventType, payload, eventLogId): Promise<string[]>` (consumed by `live-events.service.ts`, Task 10).

- [ ] **Step 1: Implement the file**

Create `apps/api/src/rules/rule-engine.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, Rule } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  defaultGoogleTtsVoiceName,
  renderTemplate,
  resolveGoogleTtsVoiceName,
  sanitizeTtsText,
  type RuleAction
} from "@ezstream/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueuesService } from "../queues/queues.service.js";
import { REDIS } from "../redis/redis.module.js";
import { evaluateConditions, pickRandom, type ConditionNode } from "./rule-evaluator.js";

const defaultGoogleTtsVoice = resolveGoogleTtsVoiceName(process.env.GOOGLE_TTS_VOICE, defaultGoogleTtsVoiceName);

type CacheEntry = { rules: Rule[]; expiresAt: number };

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isWithinActiveWindow(activeFrom: string | null, activeTo: string | null, now = new Date()): boolean {
  if (!activeFrom || !activeTo) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [fromH, fromM] = activeFrom.split(":").map(Number);
  const [toH, toM] = activeTo.split(":").map(Number);
  const from = fromH * 60 + fromM;
  const to = toH * 60 + toM;
  if (from === to) return true;
  if (from < to) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}

@Injectable()
export class RuleEngineService {
  private cache = new Map<string, CacheEntry>();
  private cooldowns = new Map<string, number>();
  private readonly cacheTtlMs = 5000;
  private readonly maxCooldownEntries = 10000;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueuesService) private readonly queues: QueuesService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  invalidate(creatorId: string) {
    this.cache.delete(creatorId);
  }

  async evaluate(creatorId: string, eventType: string, payload: Record<string, unknown>, eventLogId: string): Promise<string[]> {
    const rules = await this.loadRules(creatorId);
    const matchedIds: string[] = [];

    for (const rule of rules) {
      try {
        if (!this.appliesTo(rule, eventType)) continue;
        if (!isWithinActiveWindow(rule.activeFrom, rule.activeTo)) continue;
        if (this.isCoolingDown(rule, payload)) continue;

        const conditions = (rule.conditions ?? { all: [] }) as ConditionNode;
        if (!evaluateConditions(conditions, payload)) continue;

        matchedIds.push(rule.id);
        this.markFired(rule, payload);
        await this.runActions(creatorId, rule, payload, eventLogId);

        if (rule.stopOnMatch) break;
      } catch (error) {
        console.error(`[rules] Rule ${rule.id} failed:`, error);
        await this.prisma.eventLog
          .update({
            where: { id: eventLogId },
            data: { errorMessage: `Rule "${rule.name}" failed: ${error instanceof Error ? error.message : String(error)}` }
          })
          .catch(() => undefined);
      }
    }

    if (matchedIds.length) {
      await this.prisma.rule
        .updateMany({ where: { id: { in: matchedIds } }, data: { lastFiredAt: new Date() } })
        .catch(() => undefined);
    }

    return matchedIds;
  }

  private async loadRules(creatorId: string): Promise<Rule[]> {
    const cached = this.cache.get(creatorId);
    if (cached && cached.expiresAt > Date.now()) return cached.rules;
    const rules = await this.prisma.rule.findMany({
      where: { creatorId, isEnabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
    this.cache.set(creatorId, { rules, expiresAt: Date.now() + this.cacheTtlMs });
    return rules;
  }

  private appliesTo(rule: Rule, eventType: string): boolean {
    const types = Array.isArray(rule.eventTypes) ? (rule.eventTypes as unknown[]) : [];
    return types.includes(eventType);
  }

  private cooldownKey(rule: Rule, payload: Record<string, unknown>): string {
    if (rule.cooldownScope === "user") {
      const username = typeof payload.username === "string" ? payload.username : "unknown";
      return `${rule.id}:${username}`;
    }
    return rule.id;
  }

  private isCoolingDown(rule: Rule, payload: Record<string, unknown>): boolean {
    if (rule.cooldownSeconds <= 0) return false;
    const key = this.cooldownKey(rule, payload);
    const lastFired = this.cooldowns.get(key) ?? (rule.cooldownScope === "rule" ? rule.lastFiredAt?.getTime() ?? 0 : 0);
    return Date.now() - lastFired < rule.cooldownSeconds * 1000;
  }

  private markFired(rule: Rule, payload: Record<string, unknown>) {
    if (rule.cooldownSeconds <= 0) return;
    this.pruneCooldowns();
    this.cooldowns.set(this.cooldownKey(rule, payload), Date.now());
  }

  private pruneCooldowns() {
    if (this.cooldowns.size < this.maxCooldownEntries) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, timestamp] of this.cooldowns) {
      if (timestamp < cutoff) this.cooldowns.delete(key);
    }
  }

  private async runActions(creatorId: string, rule: Rule, payload: Record<string, unknown>, eventLogId: string) {
    const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as RuleAction[]) : [];
    for (const action of actions) {
      await this.runAction(creatorId, action, payload, eventLogId);
    }
  }

  private async runAction(creatorId: string, action: RuleAction, payload: Record<string, unknown>, eventLogId: string) {
    if (action.type === "RANDOM") {
      const chosen = pickRandom(action.actions ?? [], action.pick ?? 1);
      for (const child of chosen) await this.runAction(creatorId, child, payload, eventLogId);
      return;
    }
    if (action.type === "SPEAK_TTS") {
      await this.speakTts(creatorId, action, payload, eventLogId);
      return;
    }
    if (!action.widgetId) return;
    await this.dispatchWidgetAction(creatorId, action, payload);
  }

  private resolveAmount(amount: RuleAction["amount"], payload: Record<string, unknown>): number | undefined {
    if (amount === undefined) return undefined;
    if (typeof amount === "number") return amount;
    const numeric = Number(renderTemplate(amount, payload));
    return Number.isFinite(numeric) ? numeric : 1;
  }

  private async resolveMediaUrl(creatorId: string, mediaAssetId: string | undefined): Promise<string | undefined> {
    if (!mediaAssetId) return undefined;
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, creatorId } });
    return asset?.publicPath;
  }

  private async dispatchWidgetAction(creatorId: string, action: RuleAction, payload: Record<string, unknown>) {
    const widget = await this.prisma.widget.findFirst({ where: { id: action.widgetId, creatorId } });
    if (!widget) return;

    const renderedText = action.textTemplate ? renderTemplate(action.textTemplate, payload) : undefined;
    const mediaUrl = await this.resolveMediaUrl(creatorId, action.mediaAssetId);
    const amount = this.resolveAmount(action.amount, payload);

    const actionPayload: Record<string, unknown> = {
      ...payload,
      renderedText,
      mediaUrl,
      durationMs: action.durationMs,
      amount
    };

    const widgetAction = await this.prisma.widgetAction.create({
      data: {
        creatorId,
        widgetId: widget.id,
        actionType: action.type,
        payload: actionPayload as Prisma.InputJsonValue
      }
    });

    await this.queues.widgetActions.add("widget.action", { widgetActionId: widgetAction.id });
  }

  private async speakTts(creatorId: string, action: RuleAction, payload: Record<string, unknown>, eventLogId: string) {
    if (!action.widgetId) return;
    const widget = await this.prisma.widget.findFirst({
      where: { id: action.widgetId, creatorId, type: "TTS_WIDGET" },
      select: { id: true, config: true }
    });
    if (!widget) return;

    const widgetConfig = jsonObject(widget.config);
    const message = typeof payload.message === "string" ? payload.message : "";

    if (widgetConfig.ignoreCommands !== false && (message.startsWith("!") || message.startsWith("/"))) {
      return;
    }

    let filteredMessage = message;
    if (typeof widgetConfig.bannedWords === "string" && widgetConfig.bannedWords.trim()) {
      const words = widgetConfig.bannedWords.split(",").map((w) => w.trim()).filter(Boolean);
      for (const word of words) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filteredMessage = filteredMessage.replace(new RegExp(escaped, "gi"), "");
      }
    }

    const maxLen = typeof widgetConfig.maxMessageLength === "number" ? widgetConfig.maxMessageLength : 300;
    if (filteredMessage.length > maxLen) {
      filteredMessage = filteredMessage.slice(0, maxLen);
    }

    const nextPayload = { ...payload, message: filteredMessage };
    const template = action.textTemplate ?? (widgetConfig.includeSenderName === false ? "{message}" : "{displayName}: {message}");
    const text = sanitizeTtsText(renderTemplate(template, nextPayload));
    if (!text) return;

    const voice = resolveGoogleTtsVoiceName(widgetConfig.voice, defaultGoogleTtsVoice);
    const speed = typeof widgetConfig.speed === "number" ? widgetConfig.speed : 1;
    const pitch = typeof widgetConfig.pitch === "number" ? widgetConfig.pitch : 1;
    const volume = typeof widgetConfig.volume === "number" ? widgetConfig.volume : 1;

    const job = await this.prisma.ttsJob.create({
      data: {
        creatorId,
        widgetId: action.widgetId,
        eventLogId,
        text,
        voice,
        speed,
        pitch,
        volume,
        payload: { type: "tts.audio", text, voice, speed, pitch, volume }
      }
    });

    await this.queues.ttsJobs.add("tts.speak", { ttsJobId: job.id });
    await this.publishWidget(action.widgetId, "tts.queued", { ttsJobId: job.id, text });
  }

  private async publishWidget(widgetId: string, event: string, payload: unknown) {
    const widget = await this.prisma.widget.findUnique({ where: { id: widgetId }, include: { overlay: true } });
    if (!widget) return;
    await this.redis.publish("ezstream:realtime", JSON.stringify({ room: `widget:${widget.id}`, event, payload }));
    if (!widget.overlay) return;
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({ room: `overlay-token:${widget.overlay.token}`, event, payload })
    );
  }
}
```

- [ ] **Step 2: Typecheck `apps/api` now that `rules.service.ts` (Task 6), `rules.controller.ts` (Task 7), and `rule-engine.service.ts` all exist**

```bash
pnpm --filter @ezstream/api typecheck
```

Expected: fails only on `rules.module.ts` / `app.module.ts` / `live-events.service.ts` not yet wired — if there are errors specific to `rules.service.ts`, `rules.controller.ts`, or `rule-engine.service.ts` themselves (not "module not found" for files created in later tasks), fix them now. Errors about `RulesModule` or wiring not existing yet are expected and resolved by Tasks 9-10.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/rules/rule-engine.service.ts
git commit -m "api: add RuleEngineService — cache, cooldown, timing window, action dispatch"
```

---

## Task 9: `rules-bootstrap.service.ts` and `rules.module.ts`

**Files:**
- Create: `apps/api/src/rules/rules-bootstrap.service.ts`
- Create: `apps/api/src/rules/rules.module.ts`

**Interfaces:**
- Consumes: `PrismaService`; all of Tasks 6-8's exports.
- Produces: `RulesModule` exporting `RuleEngineService` and `RulesService`, registering `RulesController`. Consumed by `live-events.module.ts` (Task 10) and `app.module.ts` (Task 11).

- [ ] **Step 1: Implement the bootstrap service**

Create `apps/api/src/rules/rules-bootstrap.service.ts`:

```ts
import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class RulesBootstrapService implements OnApplicationBootstrap {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const creators = await this.prisma.creator.findMany({
      where: { rules: { none: {} } },
      select: { id: true }
    });
    for (const creator of creators) {
      await this.createDefaultChatRule(creator.id).catch((error) => {
        console.error(`[rules] Failed to create default rule for creator ${creator.id}:`, error);
      });
    }
  }

  private async createDefaultChatRule(creatorId: string) {
    const widget = await this.prisma.widget.findFirst({
      where: { creatorId, type: "TTS_WIDGET", isEnabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    if (!widget) return;

    await this.prisma.rule.create({
      data: {
        creatorId,
        name: "อ่านแชทเป็นเสียง (TTS)",
        isEnabled: true,
        priority: 0,
        eventTypes: ["live.chat.message"],
        conditions: { all: [] },
        actions: [{ type: "SPEAK_TTS", widgetId: widget.id }]
      }
    });
  }
}
```

- [ ] **Step 2: Implement the module**

Create `apps/api/src/rules/rules.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { QueuesModule } from "../queues/queues.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { RuleEngineService } from "./rule-engine.service.js";
import { RulesBootstrapService } from "./rules-bootstrap.service.js";
import { RulesController } from "./rules.controller.js";
import { RulesService } from "./rules.service.js";

@Module({
  imports: [PrismaModule, QueuesModule, RedisModule],
  controllers: [RulesController],
  providers: [RulesService, RuleEngineService, RulesBootstrapService],
  exports: [RuleEngineService, RulesService]
})
export class RulesModule {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/rules/rules-bootstrap.service.ts apps/api/src/rules/rules.module.ts
git commit -m "api: add RulesModule with default-rule bootstrap on startup"
```

---

## Task 10: Wire the rule engine into `LiveEventsService`

**Files:**
- Modify: `apps/api/src/live-events/live-events.service.ts`
- Modify: `apps/api/src/live-events/live-events.module.ts`

**Interfaces:**
- Consumes: `RuleEngineService.evaluate(...)` (Task 8).
- Produces: `LiveEventsService.processEvent(creatorId, eventType, payload)` now delegates to the rule engine instead of the hardcoded chat→TTS branch, and persists real `matchedRuleIds`.

- [ ] **Step 1: Replace `live-events.service.ts`**

Replace the full contents of `apps/api/src/live-events/live-events.service.ts` with:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import type { Redis } from "ioredis";
import { RuleEngineService } from "../rules/rule-engine.service.js";

@Injectable()
export class LiveEventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuleEngineService) private readonly ruleEngine: RuleEngineService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  async processEvent(creatorId: string, eventType: string, payload: Record<string, unknown>) {
    const eventLog = await this.prisma.eventLog.create({
      data: {
        creatorId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: "RECEIVED"
      }
    });

    await this.publishCreator(creatorId, "event.received", { eventLogId: eventLog.id, eventType, payload });

    const matchedRuleIds = await this.ruleEngine.evaluate(creatorId, eventType, payload, eventLog.id);

    const updated = await this.prisma.eventLog.update({
      where: { id: eventLog.id },
      data: {
        status: matchedRuleIds.length ? "MATCHED" : "PROCESSED",
        matchedRuleIds: JSON.stringify(matchedRuleIds)
      }
    });

    return { ...updated, matchedRuleIds };
  }

  private async publishCreator(creatorId: string, event: string, payload: unknown) {
    await this.redis.publish("ezstream:realtime", JSON.stringify({ room: `creator:${creatorId}`, event, payload }));
  }
}
```

This removes the old `getPathValue`, `renderTemplate`, `jsonObject`, `createDefaultChatTtsJob`, `createTtsJob`, and `publishWidget` — all of that logic now lives in `RuleEngineService` (Task 8) or `@ezstream/shared` (Task 2).

- [ ] **Step 2: Update the module to import `RulesModule` instead of `QueuesModule`**

Replace `apps/api/src/live-events/live-events.module.ts` with:

```ts
import { Module } from "@nestjs/common";
import { LiveEventsService } from "./live-events.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { RulesModule } from "../rules/rules.module.js";

@Module({
  imports: [PrismaModule, RedisModule, RulesModule],
  providers: [LiveEventsService],
  exports: [LiveEventsService]
})
export class LiveEventsModule {}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @ezstream/api typecheck
```

Expected: no errors referencing `live-events.service.ts` or `live-events.module.ts`. (Errors about `app.module.ts` not yet importing `RulesModule` are resolved in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/live-events/live-events.service.ts apps/api/src/live-events/live-events.module.ts
git commit -m "api: LiveEventsService delegates to the rule engine instead of hardcoded chat TTS"
```

---

## Task 11: Register `RulesModule` in `AppModule`

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `/rules/*` routes are live; `RulesBootstrapService.onApplicationBootstrap` runs on every API start.

- [ ] **Step 1: Add the import and register the module**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { RulesModule } from "./rules/rules.module.js";
```

And add `RulesModule` to the `imports` array — insert it right after `WidgetsModule` (before `EventsModule`):

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    QueuesModule,
    AuthModule,
    UsersModule,
    CreatorsModule,
    OverlaysModule,
    WidgetsModule,
    RulesModule,
    EventsModule,
    RealtimeModule,
    LiveEventsModule,
    TtsModule,
    MediaModule,
    MockEventsModule,
    AuditLogsModule,
    PublicModule,
    ChatSourcesModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}
```

- [ ] **Step 2: Typecheck the whole API**

```bash
pnpm --filter @ezstream/api typecheck
```

Expected: exits 0, no errors anywhere in `apps/api`.

- [ ] **Step 3: Run the API dev server and confirm it boots**

```bash
pnpm --filter @ezstream/api dev
```

Expected: console prints `EZStream API listening on http://localhost:4000` with no unhandled errors. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "api: register RulesModule in AppModule"
```

---

## Task 12: `queues.service.ts` — `SHOW_IMAGE` state + dynamic `PLAY_SOUND` media

**Files:**
- Modify: `apps/api/src/queues/queues.service.ts`

**Interfaces:**
- Produces: `processWidgetAction` now sets `state.src` for both `PLAY_SOUND` (when the action carried a `mediaUrl`) and the new `SHOW_IMAGE` case, so `ImageWidget`/`SOUND_WIDGET` in `widget-renderer.tsx` pick up rule-driven media without further changes.

- [ ] **Step 1: Extend the action-type branch in `processWidgetAction`**

In `apps/api/src/queues/queues.service.ts`, find this block (around line 119-132):

```ts
    if (action.actionType === "UPDATE_GOAL") {
      const amount = Number(payload.amount ?? 1);
      const current = Number(nextState.current ?? 0);
      nextState = { ...nextState, current: current + (Number.isFinite(amount) ? amount : 1) };
    } else if (action.actionType === "APPEND_EVENT_LIST") {
      const items = Array.isArray(nextState.items) ? nextState.items : [];
      nextState = { ...nextState, items: [payload, ...items].slice(0, 20) };
    } else if (action.actionType === "PLAY_SOUND") {
      nextState = { ...nextState, playing: true, lastAction: payload, lastTriggeredAt: new Date().toISOString() };
    } else if (action.actionType === "UPDATE_TEXT") {
      nextState = { ...nextState, text: payload.renderedText ?? payload.text ?? "" };
    } else {
      nextState = { ...nextState, visible: true, lastAction: payload, lastTriggeredAt: new Date().toISOString() };
    }
```

Replace it with:

```ts
    if (action.actionType === "UPDATE_GOAL") {
      const amount = Number(payload.amount ?? 1);
      const current = Number(nextState.current ?? 0);
      nextState = { ...nextState, current: current + (Number.isFinite(amount) ? amount : 1) };
    } else if (action.actionType === "APPEND_EVENT_LIST") {
      const items = Array.isArray(nextState.items) ? nextState.items : [];
      nextState = { ...nextState, items: [payload, ...items].slice(0, 20) };
    } else if (action.actionType === "PLAY_SOUND") {
      const mediaUrl = typeof payload.mediaUrl === "string" && payload.mediaUrl ? payload.mediaUrl : undefined;
      nextState = {
        ...nextState,
        playing: true,
        src: mediaUrl ?? nextState.src,
        lastAction: payload,
        lastTriggeredAt: new Date().toISOString()
      };
    } else if (action.actionType === "UPDATE_TEXT") {
      nextState = { ...nextState, text: payload.renderedText ?? payload.text ?? "" };
    } else if (action.actionType === "SHOW_IMAGE") {
      const mediaUrl = typeof payload.mediaUrl === "string" && payload.mediaUrl ? payload.mediaUrl : undefined;
      nextState = {
        ...nextState,
        visible: true,
        src: mediaUrl ?? nextState.src,
        lastAction: payload,
        lastTriggeredAt: new Date().toISOString()
      };
    } else {
      nextState = { ...nextState, visible: true, lastAction: payload, lastTriggeredAt: new Date().toISOString() };
    }
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @ezstream/api typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/queues/queues.service.ts
git commit -m "api: widget action queue sets state.src for PLAY_SOUND and SHOW_IMAGE"
```

---

## Task 13: Mock events — align gift field names, add `subscribe`

**Files:**
- Modify: `apps/api/src/mock-events/mock-events.controller.ts`

**Interfaces:**
- Produces: `POST /mock-events/gift` now emits `repeatCount`/`coins` (matching the real TikTok listener added in Task 15, and the field names used in the rules editor's `FIELD_OPTIONS`/`SAMPLE_PAYLOADS` in Task 20) instead of `giftCount`. New `POST /mock-events/subscribe` emits `live.subscribe.received`.

- [ ] **Step 1: Update the gift mock and add the subscribe mock**

In `apps/api/src/mock-events/mock-events.controller.ts`, replace the `gift` handler:

```ts
  @Post("gift")
  gift(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.gift.received", {
      username: dto.username ?? "demo_viewer",
      giftName: "Rose",
      repeatCount: 1,
      coins: 1,
      ...(dto.payload ?? {})
    });
  }
```

And add a new handler right after the `share` handler (before `join`):

```ts
  @Post("subscribe")
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.subscribe.received", {
      username: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @ezstream/api typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mock-events/mock-events.controller.ts
git commit -m "api: align mock gift payload fields with real TikTok events, add subscribe mock"
```

---

## Task 14: Dashboard mock-event board — add the "subscribe" button

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Produces: a 7th mock-event button (`subscribe`), reachable via `ALT+7`, matching Task 13's new endpoint.

- [ ] **Step 1: Add `subscribe` to the mock events list and extend the hotkey range**

In `apps/web/app/dashboard/page.tsx`, change:

```ts
const mockEvents = ["chat", "gift", "follow", "like", "share", "join"];
```

to:

```ts
const mockEvents = ["chat", "gift", "follow", "like", "share", "join", "subscribe"];
```

And change the hotkey guard in `handleKeyDown`:

```ts
      if (e.altKey && e.key >= "1" && e.key <= "6") {
```

to:

```ts
      if (e.altKey && e.key >= "1" && e.key <= "7") {
```

- [ ] **Step 2: Verify in the browser**

Start the dev servers (`pnpm dev` from repo root), open `http://localhost:3000/dashboard`, and confirm a 7th "subscribe" tile renders in the "ทดสอบการแจ้งเตือน" grid and clicking it shows the success toast without a console error. Stop the dev servers once confirmed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/page.tsx
git commit -m "web: add subscribe mock-event button"
```

---

## Task 15: Real TikTok gift/follow/like/share/subscribe events

**Files:**
- Modify: `apps/api/src/chat-sources/chat-connector.service.ts`

**Interfaces:**
- Produces: TikTok gift streaks fire `live.gift.received` only once per streak (on `repeatEnd` or non-streakable gifts); `follow`/`like`/`share` fire their own event types; `member` events with `action === MemberMessageAction.SUBSCRIBED` fire `live.subscribe.received`. All feed `LiveEventsService.processEvent`, so rules (and the mock-event field names from Task 13) apply identically to real streams.

- [ ] **Step 1: Add the listeners inside `connectTikTok`**

In `apps/api/src/chat-sources/chat-connector.service.ts`, the `connectTikTok` method already imports `TikTokLiveConnection, WebcastEvent, ControlEvent` (Step: `const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import("tiktok-live-connector");`). Change that import line to also pull `MemberMessageAction`:

```ts
      const { TikTokLiveConnection, WebcastEvent, ControlEvent, MemberMessageAction } = await import("tiktok-live-connector");
```

Also change `enableExtendedGiftInfo: false` to `enableExtendedGiftInfo: true` in the `TikTokLiveConnection` options so diamond values are available:

```ts
        const tiktok = new TikTokLiveConnection(username, {
          processInitialData: false,
          fetchRoomInfoOnConnect: false,
          enableExtendedGiftInfo: true,
          connectWithUniqueId: attempt.connectWithUniqueId,
          signApiKey: signApiKey || undefined,
          wsClientHeaders: {
            Origin: "https://www.tiktok.com"
          }
        });
```

- [ ] **Step 2: Add a `creatorId` resolver and the five real-event handlers**

`processEvent` needs `creatorId`, not `chatSourceId` — and `connectTikTok`'s scope only has `chatSourceId`/`overlayToken` in scope, the same situation `publishChatMessage(chatSourceId, overlayToken, message)` already solves by looking up the `ChatSource` row. Add a small private helper next to `publishChatMessage` (search for `private async publishChatMessage` in the file) that does the same lookup and forwards to `processEvent`, so each listener below is a one-liner instead of duplicating the lookup:

```ts
  private async processTikTokEvent(chatSourceId: string, overlayToken: string, eventType: string, payload: Record<string, unknown>) {
    const source = await this.prisma.chatSource.findUnique({ where: { id: chatSourceId } });
    if (!source) return;
    await this.liveEvents.processEvent(source.creatorId, eventType, {
      ...payload,
      platform: "tiktok",
      overlayId: source.overlayId,
      overlayToken
    });
  }
```

Then, in `connectTikTok`, immediately after the `tiktok.on(WebcastEvent.EMOTE, ...)` block and before `(tiktok as any).on("roomUser", ...)`, add:

```ts
        tiktok.on(WebcastEvent.GIFT, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          const isStreakable = data.giftType === 1;
          if (isStreakable && !data.repeatEnd) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.gift.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            avatarUrl: this.resolveTikTokAvatarUrl(data.user),
            giftName: data.giftName,
            giftId: data.giftId,
            repeatCount: data.repeatCount ?? 1,
            coins: (data.diamondCount ?? 0) * (data.repeatCount ?? 1)
          });
        });

        tiktok.on(WebcastEvent.FOLLOW, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.follow.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            avatarUrl: this.resolveTikTokAvatarUrl(data.user)
          });
        });

        tiktok.on(WebcastEvent.SHARE, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.share.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown"
          });
        });

        tiktok.on(WebcastEvent.LIKE, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.like.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
            likeCount: data.likeCount ?? 1,
            totalLikeCount: data.totalLikeCount ?? 0
          });
        });

        tiktok.on(WebcastEvent.MEMBER, (data: any) => {
          if (!this.isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
          if (data.action !== MemberMessageAction.SUBSCRIBED) return;
          void this.processTikTokEvent(chatSourceId, overlayToken, "live.subscribe.received", {
            username: data.user?.uniqueId ?? "unknown",
            displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown"
          });
        });
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @ezstream/api typecheck
```

Expected: exits 0. If `MemberMessageAction` or `WebcastEvent.MEMBER`/`GIFT`/`FOLLOW`/`SHARE`/`LIKE` are reported as not exported by `tiktok-live-connector`'s types, check `node_modules/.pnpm/tiktok-live-connector@2.1.1-beta1/node_modules/tiktok-live-connector/dist/types/events.d.ts` and `.../types/tiktok/enums.d.ts` for the exact export names — they were confirmed present there during planning, but pin the exact casing if TypeScript disagrees.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/chat-sources/chat-connector.service.ts
git commit -m "api: wire real TikTok gift/follow/like/share/subscribe events into the rule engine"
```

---

## Task 16: Seed script — default rule + example gift rule for the demo account

**Files:**
- Modify: `packages/db/prisma/seed.ts`

**Interfaces:**
- Produces: after `pnpm db:seed`, the demo creator has a TTS_WIDGET, a default "อ่านแชทเป็นเสียง" rule, and an example "ขอบคุณสำหรับของขวัญ" gift rule — so the demo account is immediately useful without needing the API's boot-time bootstrap to have run first.

- [ ] **Step 1: Extend `main()` to create a TTS widget and two rules**

In `packages/db/prisma/seed.ts`, add after the `overlay.upsert(...)` block and before the final `console.log`:

```ts
  const ttsWidget = await prisma.widget.upsert({
    where: { id: "demo_tts_widget" },
    update: { name: "TTS", type: WidgetType.TTS_WIDGET, overlayId: mainOverlayId, isEnabled: true },
    create: {
      id: "demo_tts_widget",
      creatorId: demoCreatorId,
      overlayId: mainOverlayId,
      type: WidgetType.TTS_WIDGET,
      name: "TTS",
      isEnabled: true,
      config: {}
    }
  });

  const alertWidget = await prisma.widget.upsert({
    where: { id: "demo_alert_widget" },
    update: { name: "Gift Alert", type: WidgetType.ALERT_WIDGET, overlayId: mainOverlayId, isEnabled: true },
    create: {
      id: "demo_alert_widget",
      creatorId: demoCreatorId,
      overlayId: mainOverlayId,
      type: WidgetType.ALERT_WIDGET,
      name: "Gift Alert",
      isEnabled: true,
      config: {}
    }
  });

  await prisma.rule.upsert({
    where: { id: "demo_rule_chat_tts" },
    update: {},
    create: {
      id: "demo_rule_chat_tts",
      creatorId: demoCreatorId,
      name: "อ่านแชทเป็นเสียง (TTS)",
      isEnabled: true,
      priority: 0,
      eventTypes: ["live.chat.message"],
      conditions: { all: [] },
      actions: [{ type: "SPEAK_TTS", widgetId: ttsWidget.id }]
    }
  });

  await prisma.rule.upsert({
    where: { id: "demo_rule_gift_thanks" },
    update: {},
    create: {
      id: "demo_rule_gift_thanks",
      creatorId: demoCreatorId,
      name: "ขอบคุณสำหรับของขวัญ",
      isEnabled: true,
      priority: 1,
      eventTypes: ["live.gift.received"],
      conditions: { all: [] },
      actions: [{ type: "SHOW_ALERT", widgetId: alertWidget.id, textTemplate: "ขอบคุณ {displayName} สำหรับ {giftName}!", durationMs: 5000 }],
      cooldownSeconds: 3,
      cooldownScope: "rule"
    }
  });
```

- [ ] **Step 2: Run the seed and verify**

```bash
pnpm db:seed
```

Expected: prints `Seed completed for demo@example.com / password123` with no errors. Then verify the rows exist:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.rule.findMany({ where: { creatorId: 'demo_creator' } }).then((rules) => { console.log(rules.map(r => r.name)); return prisma.\$disconnect(); });
"
```

Run this from `packages/db` (so `@prisma/client` resolves). Expected output includes `[ 'อ่านแชทเป็นเสียง (TTS)', 'ขอบคุณสำหรับของขวัญ' ]`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "db: seed default chat-TTS rule and example gift-thanks rule for demo account"
```

---

## Task 17: Allow creating all widget types (unblocks rule actions)

**Files:**
- Modify: `apps/web/app/dashboard/widgets/new/page.tsx`

**Interfaces:**
- Produces: the "สร้าง Widget" form's type dropdown now offers all 8 `WidgetType` values (previously only `CHAT_WIDGET`, `TTS_WIDGET`, `VIEWER_COUNT_WIDGET`), so creators can actually create `ALERT_WIDGET`/`GOAL_WIDGET`/`EVENT_LIST_WIDGET`/`IMAGE_WIDGET`/`SOUND_WIDGET`/`TEXT_WIDGET` to target from rule actions. `widget-renderer.tsx` already renders reasonable defaults for all of these — no renderer change needed for creation to work.

- [ ] **Step 1: Expand the type list**

In `apps/web/app/dashboard/widgets/new/page.tsx`, replace:

```ts
const widgetTypes = [
  "CHAT_WIDGET",
  "TTS_WIDGET",
  "VIEWER_COUNT_WIDGET"
];
```

with:

```ts
const widgetTypes = [
  "CHAT_WIDGET",
  "TTS_WIDGET",
  "VIEWER_COUNT_WIDGET",
  "ALERT_WIDGET",
  "GOAL_WIDGET",
  "EVENT_LIST_WIDGET",
  "IMAGE_WIDGET",
  "SOUND_WIDGET",
  "TEXT_WIDGET"
];
```

- [ ] **Step 2: Verify in the browser**

Start `pnpm dev`, go to `/dashboard/widgets/new`, confirm the "ประเภท" dropdown lists all 9 options, and create one `ALERT_WIDGET` and one `TTS_WIDGET` (bound to your test overlay) to use in Task 20's manual verification. Leave them in place.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/widgets/new/page.tsx
git commit -m "web: allow creating all widget types so rule actions have targets"
```

---

## Task 18: `widget-renderer.tsx` — media URL resolution, duration-based Alert/Image

**Files:**
- Modify: `apps/web/components/widget-renderer.tsx`

**Interfaces:**
- Produces: `ImageWidget` and the `SOUND_WIDGET` `<audio>` element resolve relative `/storage/...` src values (as returned by `MediaAsset.publicPath`, set into `WidgetState.src` by Task 12's queue changes) against `API_URL`. `AlertWidget` and `ImageWidget` auto-hide `durationMs` (default 5000ms) after `state.lastTriggeredAt`, instead of staying visible forever.

- [ ] **Step 1: Import `API_URL` and add a `resolveMediaSrc` helper**

In `apps/web/components/widget-renderer.tsx`, add to the top imports:

```ts
import { API_URL } from "../lib/api";
```

Add near the other small helpers (after `function color(...)`):

```ts
function resolveMediaSrc(src: string): string {
  return src.startsWith("/") ? `${API_URL}${src}` : src;
}
```

- [ ] **Step 2: Use it for the sound widget's audio source and the image widget's src**

In `WidgetRenderer`, change:

```ts
  const audioSource = text(config.src) || text(config.url) || text(state.src);
```

to:

```ts
  const rawAudioSource = text(config.src) || text(config.url) || text(state.src);
  const audioSource = rawAudioSource ? resolveMediaSrc(rawAudioSource) : "";
```

And update the `<audio>` tag at the bottom of the same component from `src={audioSource}` to `src={audioSource}` (unchanged reference, now resolved) — no further edit needed there since `audioSource` is now already resolved.

In `ImageWidget`, change:

```tsx
function ImageWidget({ widget }: { widget: OverlayWidget }) {
  const src = text(widget.config.src) || text(widget.config.url) || text(widget.state?.state?.src);
  return src ? <img src={src} alt={widget.name} className="h-full w-full object-contain" /> : <StatusWidget label="Image" value="ยังไม่มีรูป" />;
}
```

to:

```tsx
function ImageWidget({ widget }: { widget: OverlayWidget }) {
  const rawSrc = text(widget.config.src) || text(widget.config.url) || text(widget.state?.state?.src);
  const src = rawSrc ? resolveMediaSrc(rawSrc) : "";
  return src ? <img src={src} alt={widget.name} className="h-full w-full object-contain" /> : <StatusWidget label="Image" value="ยังไม่มีรูป" />;
}
```

- [ ] **Step 3: Add duration-based auto-hide to `AlertWidget` and `ImageWidget`**

Replace `AlertWidget`:

```tsx
function AlertWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const lastAction = (state.lastAction ?? {}) as Record<string, unknown>;
  const message = text(state.renderedText) || text(lastAction.renderedText) || text(config.template, widget.name);
  const durationMs = number(lastAction.durationMs, 0);
  const triggeredAt = typeof state.lastTriggeredAt === "string" ? Date.parse(state.lastTriggeredAt) : 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!durationMs || !triggeredAt) return;
    const remaining = triggeredAt + durationMs - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [durationMs, triggeredAt]);

  const visible = !durationMs || !triggeredAt || now - triggeredAt < durationMs;
  if (!visible) return <div className="h-full" />;

  return (
    <div className="flex h-full items-center gap-4 bg-black/70 p-5 border-l-4 border-primary">
      <div>
        <p className="mb-1 text-xs font-semibold text-ink-subtle">Alert</p>
        <p className="text-3xl font-black leading-tight text-white">{message}</p>
      </div>
    </div>
  );
}
```

Replace `ImageWidget` (the version from Step 2) with:

```tsx
function ImageWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const rawSrc = text(widget.config.src) || text(widget.config.url) || text(state.src);
  const src = rawSrc ? resolveMediaSrc(rawSrc) : "";
  const lastAction = (state.lastAction ?? {}) as Record<string, unknown>;
  const durationMs = number(lastAction.durationMs, 0);
  const triggeredAt = typeof state.lastTriggeredAt === "string" ? Date.parse(state.lastTriggeredAt) : 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!durationMs || !triggeredAt) return;
    const remaining = triggeredAt + durationMs - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [durationMs, triggeredAt]);

  const visible = !durationMs || !triggeredAt || now - triggeredAt < durationMs;
  if (!src || !visible) return src ? <div className="h-full" /> : <StatusWidget label="Image" value="ยังไม่มีรูป" />;

  return <img src={src} alt={widget.name} className="h-full w-full object-contain" />;
}
```

Note: `durationMs` only ever appears on `lastAction` for `SHOW_ALERT`/`SHOW_IMAGE` actions dispatched through the rule engine (Task 8 sets `durationMs: action.durationMs` into the `WidgetAction.payload`, which `processWidgetAction`'s generic/`SHOW_IMAGE` branches copy into `state.lastAction`, Task 12). Widgets triggered by the pre-existing `testTrigger` endpoint have no `durationMs` and stay visible indefinitely — unchanged prior behavior.

- [ ] **Step 4: Typecheck the web app**

```bash
pnpm --filter @ezstream/web typecheck
```

Expected: exits 0.

- [ ] **Step 5: Manual verification**

Start `pnpm dev`. In the dashboard, open the overlay preview for your test overlay (`/dashboard/overlays/edit?id=...` → open the browser-source URL, or `/overlay?token=...&editor=true`). From another tab, call the API directly to simulate a rule-fired alert:

```bash
curl -X POST http://localhost:4000/widgets/<ALERT_WIDGET_ID>/test-trigger -H "authorization: Bearer <token from localStorage ezstream_token>"
```

Expected: the alert widget shows and (since `testTrigger` sends no `durationMs`) stays visible — confirming the "no duration = always visible" path didn't regress. Full duration-based hiding is exercised end-to-end in Task 22.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/widget-renderer.tsx
git commit -m "web: resolve relative media URLs, auto-hide alert/image widgets after durationMs"
```

---

## Task 19: Dashboard nav link

**Files:**
- Modify: `apps/web/app/dashboard/layout.tsx`

**Interfaces:**
- Produces: a "Rules" nav item between "Widgets" and "TTS".

- [ ] **Step 1: Add the nav entry**

In `apps/web/app/dashboard/layout.tsx`, change:

```ts
const navItems = [
  ["/dashboard", "ภาพรวม"],
  ["/dashboard/overlays", "Overlays"],
  ["/dashboard/widgets", "Widgets"],
  ["/dashboard/tts", "TTS"],
  ["/dashboard/chat", "Chat"],
  ["/dashboard/settings", "ตั้งค่า"]
];
```

to:

```ts
const navItems = [
  ["/dashboard", "ภาพรวม"],
  ["/dashboard/overlays", "Overlays"],
  ["/dashboard/widgets", "Widgets"],
  ["/dashboard/rules", "Rules"],
  ["/dashboard/tts", "TTS"],
  ["/dashboard/chat", "Chat"],
  ["/dashboard/settings", "ตั้งค่า"]
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/dashboard/layout.tsx
git commit -m "web: add Rules nav link"
```

(Verified visually together with Task 20, once the page it links to exists.)

---

## Task 20: `/dashboard/rules` — list page

**Files:**
- Create: `apps/web/app/dashboard/rules/page.tsx`

**Interfaces:**
- Consumes: `GET /rules`, `PATCH /rules/:id`, `POST /rules`, `DELETE /rules/:id` (Task 7).
- Produces: the rules list/management page linked from Task 19's nav item and from Task 21's editor's back-navigation.

- [ ] **Step 1: Implement the page**

Create `apps/web/app/dashboard/rules/page.tsx`:

```tsx
"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Input, LoadingCards, Notice, PageActions } from "../../../components/ui-kit";
import { api } from "../../../lib/api";
import { ConfirmDeleteModal } from "../../../components/confirm-delete-modal";

type Rule = {
  id: string;
  name: string;
  isEnabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  eventTypes: string[];
  conditions: unknown;
  actions: { type: string }[];
  cooldownSeconds: number;
  cooldownScope: string;
  activeFrom: string | null;
  activeTo: string | null;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  "live.chat.message": "แชท",
  "live.gift.received": "ของขวัญ",
  "live.follow.received": "ติดตาม",
  "live.like.received": "ไลก์",
  "live.share.received": "แชร์",
  "live.subscribe.received": "สมัครสมาชิก"
};

function conditionCount(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const value = node as { all?: unknown[]; any?: unknown[]; field?: string };
  if (value.field) return 1;
  const children = value.all ?? value.any ?? [];
  return children.reduce((sum: number, child) => sum + conditionCount(child), 0);
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingRule, setDeletingRule] = useState<Rule | null>(null);

  async function load() {
    setRules(await api<Rule[]>("/rules"));
  }

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Rule ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const filteredRules = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rules;
    return rules.filter((rule) => rule.name.toLowerCase().includes(keyword));
  }, [query, rules]);

  async function toggleEnabled(rule: Rule) {
    setBusyId(rule.id);
    setError("");
    setMessage("");
    try {
      await api<Rule>(`/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ isEnabled: !rule.isEnabled }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดต Rule ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function duplicateRule(rule: Rule) {
    setBusyId(rule.id);
    setError("");
    setMessage("");
    try {
      await api("/rules", {
        method: "POST",
        body: JSON.stringify({
          name: `${rule.name} (สำเนา)`,
          isEnabled: rule.isEnabled,
          priority: rule.priority,
          stopOnMatch: rule.stopOnMatch,
          eventTypes: rule.eventTypes,
          conditions: rule.conditions,
          actions: rule.actions,
          cooldownSeconds: rule.cooldownSeconds,
          cooldownScope: rule.cooldownScope,
          activeFrom: rule.activeFrom,
          activeTo: rule.activeTo
        })
      });
      setMessage("คัดลอก Rule แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "คัดลอก Rule ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function confirmDelete() {
    if (!deletingRule) return;
    setBusyId(deletingRule.id);
    setError("");
    setMessage("");
    try {
      await api(`/rules/${deletingRule.id}`, { method: "DELETE" });
      setMessage("ลบ Rule แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Rule ไม่สำเร็จ");
    } finally {
      setBusyId("");
      setDeletingRule(null);
    }
  }

  return (
    <DashboardShell title="Rules">
      <PageActions>
        <Input className="sm:max-w-md" onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Rule" value={query} />
        <Button asChild className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold">
          <Link href="/dashboard/rules/edit">สร้าง Rule</Link>
        </Button>
      </PageActions>

      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      {loading ? (
        <LoadingCards />
      ) : filteredRules.length ? (
        <div className="grid gap-3">
          {filteredRules.map((rule) => (
            <ResourceCard key={rule.id} className="p-0 overflow-hidden">
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Link className="text-lg font-bold text-white hover:text-primary transition-colors" href={`/dashboard/rules/edit?id=${rule.id}`}>
                    {rule.name}
                  </Link>
                  <Badge tone={rule.isEnabled ? "success" : "neutral"}>{rule.isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-ink-subtle">
                  <p><span className="text-ink-faint mr-1">TRIGGER</span> {rule.eventTypes.map((type) => EVENT_TYPE_LABELS[type] ?? type).join(", ") || "ไม่มี"}</p>
                  <p><span className="text-ink-faint mr-1">เงื่อนไข</span> {conditionCount(rule.conditions)} ข้อ</p>
                  <p><span className="text-ink-faint mr-1">ACTIONS</span> {rule.actions?.length ?? 0}</p>
                  <p><span className="text-ink-faint mr-1">PRIORITY</span> {rule.priority}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface-dark border-t-2 border-border-base p-4 gap-4">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <button disabled={busyId === rule.id} onClick={() => void toggleEnabled(rule)} className="text-sm font-medium text-ink-muted hover:text-white transition-colors disabled:opacity-50">
                    {rule.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                  <button disabled={busyId === rule.id} onClick={() => void duplicateRule(rule)} className="text-sm font-medium text-ink-muted hover:text-white transition-colors disabled:opacity-50">
                    คัดลอก
                  </button>
                  <button disabled={busyId === rule.id} onClick={() => setDeletingRule(rule)} className="text-sm font-medium text-rose-500 hover:text-rose-400 transition-colors disabled:opacity-50">
                    ลบ
                  </button>
                </div>
                <Link href={`/dashboard/rules/edit?id=${rule.id}`} className="bg-primary text-surface-base px-6 py-2 text-sm font-semibold hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-none hover:shadow-brutal-sm border-2 border-transparent text-center">
                  จัดการ Rule
                </Link>
              </div>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState
          title={rules.length ? "ไม่พบ Rule ที่ค้นหา" : "ยังไม่มี Rule"}
          description={rules.length ? "ลองเปลี่ยนคำค้นหา" : "สร้าง rule แรกเพื่อกำหนดว่าเมื่อไหร่ควรเล่น alert, เสียง, หรือข้อความบน overlay"}
          action={
            rules.length ? null : (
              <Button asChild className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold">
                <Link href="/dashboard/rules/edit">สร้าง Rule</Link>
              </Button>
            )
          }
        />
      )}

      <ConfirmDeleteModal
        isOpen={!!deletingRule}
        onClose={() => setDeletingRule(null)}
        onConfirm={() => void confirmDelete()}
        title="ลบ Rule"
        itemName={deletingRule?.name ?? ""}
      />
    </DashboardShell>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @ezstream/web typecheck
```

Expected: exits 0. (An error resolving `/dashboard/rules/edit` links is fine at this point — Next.js doesn't typecheck route existence; Task 21 creates that page next.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/rules/page.tsx
git commit -m "web: add rules list page"
```

---

## Task 21: `/dashboard/rules/edit` — editor with condition builder, action editor, test panel

**Files:**
- Create: `apps/web/app/dashboard/rules/edit/page.tsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH /rules(/:id)`, `POST /rules/:id/test` (Task 7); `GET /widgets` (existing); `GET /media` (existing, from `media.controller.ts`); `ruleActionTypes`, `conditionOperators` from `@ezstream/shared` (Task 2).
- Produces: the create/edit form linked from Tasks 20's list page and 19's nav.

- [ ] **Step 1: Implement the page**

Create `apps/web/app/dashboard/rules/edit/page.tsx`:

```tsx
"use client";

import { Button } from "@ezstream/ui";
import { conditionOperators, ruleActionTypes } from "@ezstream/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { Field, Input, Notice, Select, Textarea } from "../../../../components/ui-kit";
import { api } from "../../../../lib/api";
import { useUnsavedChangesWarning } from "../../../../lib/use-unsaved-changes-warning";

type ConditionLeaf = { field: string; operator: string; value: string };
type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };
type ConditionNode = ConditionLeaf | ConditionGroup;

type RuleAction = {
  type: string;
  widgetId?: string;
  mediaAssetId?: string;
  textTemplate?: string;
  durationMs?: number;
  amount?: string;
  pick?: number;
  actions?: RuleAction[];
};

type Widget = { id: string; name: string; type: string };
type MediaAsset = { id: string; originalName: string; type: string };
type TraceEntry = { field: string; operator: string; expected: unknown; actual: unknown; passed: boolean };

type RuleDetail = {
  name: string;
  isEnabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  eventTypes: string[];
  conditions: ConditionGroup;
  actions: RuleAction[];
  cooldownSeconds: number;
  cooldownScope: string;
  activeFrom: string | null;
  activeTo: string | null;
};

const EVENT_TYPE_OPTIONS = [
  { value: "live.chat.message", label: "ข้อความแชท" },
  { value: "live.gift.received", label: "ได้รับของขวัญ" },
  { value: "live.follow.received", label: "มีผู้ติดตามใหม่" },
  { value: "live.like.received", label: "ได้รับไลก์" },
  { value: "live.share.received", label: "มีการแชร์" },
  { value: "live.subscribe.received", label: "สมัครสมาชิกใหม่" }
];

const FIELD_OPTIONS: Record<string, string[]> = {
  "live.chat.message": ["message", "username", "displayName"],
  "live.gift.received": ["giftName", "repeatCount", "coins", "username", "displayName"],
  "live.follow.received": ["username", "displayName"],
  "live.like.received": ["likeCount", "totalLikeCount", "username", "displayName"],
  "live.share.received": ["username", "displayName"],
  "live.subscribe.received": ["username", "displayName"]
};

const ACTION_WIDGET_TYPE: Record<string, string> = {
  SHOW_ALERT: "ALERT_WIDGET",
  SPEAK_TTS: "TTS_WIDGET",
  PLAY_SOUND: "SOUND_WIDGET",
  SHOW_IMAGE: "IMAGE_WIDGET",
  UPDATE_TEXT: "TEXT_WIDGET",
  UPDATE_GOAL: "GOAL_WIDGET",
  APPEND_EVENT_LIST: "EVENT_LIST_WIDGET"
};

const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  "live.chat.message": { username: "tester", displayName: "Tester", message: "!hello สวัสดี" },
  "live.gift.received": { username: "tester", displayName: "Tester", giftName: "Rose", repeatCount: 5, coins: 100 },
  "live.follow.received": { username: "tester", displayName: "Tester" },
  "live.like.received": { username: "tester", displayName: "Tester", likeCount: 10, totalLikeCount: 500 },
  "live.share.received": { username: "tester", displayName: "Tester" },
  "live.subscribe.received": { username: "tester", displayName: "Tester" }
};

function isGroup(node: ConditionNode): node is ConditionGroup {
  return "all" in node || "any" in node;
}

function groupKind(node: ConditionGroup): "all" | "any" {
  return "all" in node ? "all" : "any";
}

function groupChildren(node: ConditionGroup): ConditionNode[] {
  return "all" in node ? node.all : node.any;
}

function withChildren(node: ConditionGroup, children: ConditionNode[]): ConditionGroup {
  return groupKind(node) === "all" ? { all: children } : { any: children };
}

function ConditionGroupEditor({
  node,
  fields,
  onChange,
  onRemove
}: {
  node: ConditionGroup;
  fields: string[];
  onChange: (next: ConditionGroup) => void;
  onRemove?: () => void;
}) {
  const kind = groupKind(node);
  const children = groupChildren(node);

  function updateChild(index: number, next: ConditionNode) {
    const nextChildren = [...children];
    nextChildren[index] = next;
    onChange(withChildren(node, nextChildren));
  }

  function removeChild(index: number) {
    onChange(withChildren(node, children.filter((_, i) => i !== index)));
  }

  function addCondition() {
    onChange(withChildren(node, [...children, { field: fields[0] ?? "username", operator: "equals", value: "" }]));
  }

  function addGroup() {
    onChange(withChildren(node, [...children, { all: [] }]));
  }

  return (
    <div className="space-y-3 border-2 border-border-base bg-surface-dark p-4">
      <div className="flex items-center justify-between gap-2">
        <Select className="max-w-[200px]" value={kind} onChange={(event) => onChange(withChildren({ [event.target.value]: [] } as ConditionGroup, children))}>
          <option value="all">ต้องตรงทุกข้อ (AND)</option>
          <option value="any">ตรงข้อใดข้อหนึ่ง (OR)</option>
        </Select>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-rose-500 hover:text-rose-400">
            ลบกลุ่มนี้
          </button>
        ) : null}
      </div>

      {children.map((child, index) =>
        isGroup(child) ? (
          <ConditionGroupEditor
            key={index}
            node={child}
            fields={fields}
            onChange={(next) => updateChild(index, next)}
            onRemove={() => removeChild(index)}
          />
        ) : (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select
              className="max-w-[160px]"
              value={fields.includes(child.field) ? child.field : "__custom__"}
              onChange={(event) => updateChild(index, { ...child, field: event.target.value === "__custom__" ? "" : event.target.value })}
            >
              {fields.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
              <option value="__custom__">กำหนดเอง...</option>
            </Select>
            {!fields.includes(child.field) ? (
              <Input
                className="max-w-[140px]"
                placeholder="ชื่อ field"
                value={child.field}
                onChange={(event) => updateChild(index, { ...child, field: event.target.value })}
              />
            ) : null}
            <Select className="max-w-[190px]" value={child.operator} onChange={(event) => updateChild(index, { ...child, operator: event.target.value })}>
              {conditionOperators.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </Select>
            {child.operator !== "exists" ? (
              <Input
                className="max-w-[180px]"
                placeholder={child.operator === "in" ? "ค่า1, ค่า2, ..." : "ค่า"}
                value={child.value}
                onChange={(event) => updateChild(index, { ...child, value: event.target.value })}
              />
            ) : null}
            <button type="button" onClick={() => removeChild(index)} className="text-xs font-semibold text-rose-500 hover:text-rose-400">
              ลบ
            </button>
          </div>
        )
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={addCondition} className="text-xs font-semibold text-primary hover:opacity-80">
          + เพิ่มเงื่อนไข
        </button>
        <button type="button" onClick={addGroup} className="text-xs font-semibold text-primary hover:opacity-80">
          + เพิ่มกลุ่มย่อย
        </button>
      </div>
    </div>
  );
}

function ActionEditor({
  action,
  widgets,
  mediaAssets,
  onChange,
  onRemove,
  isRandomChild
}: {
  action: RuleAction;
  widgets: Widget[];
  mediaAssets: MediaAsset[];
  onChange: (next: RuleAction) => void;
  onRemove: () => void;
  isRandomChild: boolean;
}) {
  const requiredWidgetType = action.type === "SPEAK_TTS" ? "TTS_WIDGET" : ACTION_WIDGET_TYPE[action.type];
  const compatibleWidgets = requiredWidgetType ? widgets.filter((w) => w.type === requiredWidgetType) : [];
  const needsMedia = action.type === "PLAY_SOUND" || action.type === "SHOW_IMAGE";
  const mediaType = action.type === "PLAY_SOUND" ? "AUDIO" : "IMAGE";
  const needsText = ["SHOW_ALERT", "SPEAK_TTS", "UPDATE_TEXT", "APPEND_EVENT_LIST"].includes(action.type);
  const needsDuration = action.type === "SHOW_ALERT" || action.type === "SHOW_IMAGE";
  const needsAmount = action.type === "UPDATE_GOAL";

  return (
    <div className="space-y-3 border-2 border-border-base bg-surface-dark p-4">
      <div className="flex items-center justify-between gap-2">
        <Select className="max-w-[220px]" value={action.type} onChange={(event) => onChange({ type: event.target.value })}>
          {ruleActionTypes
            .filter((type) => !isRandomChild || type !== "RANDOM")
            .map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
        </Select>
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-rose-500 hover:text-rose-400">
          ลบ Action
        </button>
      </div>

      {action.type === "RANDOM" ? (
        <RandomActionEditor action={action} widgets={widgets} mediaAssets={mediaAssets} onChange={onChange} />
      ) : (
        <>
          {requiredWidgetType ? (
            <Field label={`Widget (${requiredWidgetType})`}>
              <Select value={action.widgetId ?? ""} onChange={(event) => onChange({ ...action, widgetId: event.target.value })}>
                <option value="">เลือก Widget</option>
                {compatibleWidgets.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
              {compatibleWidgets.length === 0 ? (
                <p className="mt-1 text-xs text-amber-400">ยังไม่มี {requiredWidgetType} — สร้างที่หน้า Widgets ก่อน</p>
              ) : null}
            </Field>
          ) : null}

          {needsMedia ? (
            <Field label={`ไฟล์สื่อ (${mediaType === "AUDIO" ? "เสียง" : "รูปภาพ"})`}>
              <Select value={action.mediaAssetId ?? ""} onChange={(event) => onChange({ ...action, mediaAssetId: event.target.value })}>
                <option value="">เลือกไฟล์</option>
                {mediaAssets
                  .filter((a) => a.type === mediaType)
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.originalName}</option>
                  ))}
              </Select>
            </Field>
          ) : null}

          {needsText ? (
            <Field label="ข้อความ" hint="ใช้ {field} แทนค่าจาก event เช่น {displayName}, {message}, {giftName}">
              <Textarea rows={2} value={action.textTemplate ?? ""} onChange={(event) => onChange({ ...action, textTemplate: event.target.value })} />
            </Field>
          ) : null}

          {needsDuration ? (
            <Field label="ระยะเวลาแสดง (ms)">
              <Input type="number" min={500} value={action.durationMs ?? 5000} onChange={(event) => onChange({ ...action, durationMs: Number(event.target.value) })} />
            </Field>
          ) : null}

          {needsAmount ? (
            <Field label="จำนวนที่เพิ่ม" hint="ใส่ตัวเลข หรือ {field} เช่น {coins}">
              <Input value={action.amount ?? "1"} onChange={(event) => onChange({ ...action, amount: event.target.value })} />
            </Field>
          ) : null}
        </>
      )}
    </div>
  );
}

function RandomActionEditor({
  action,
  widgets,
  mediaAssets,
  onChange
}: {
  action: RuleAction;
  widgets: Widget[];
  mediaAssets: MediaAsset[];
  onChange: (next: RuleAction) => void;
}) {
  const children = action.actions ?? [];

  function updateChild(index: number, next: RuleAction) {
    const nextChildren = [...children];
    nextChildren[index] = next;
    onChange({ ...action, actions: nextChildren });
  }

  function removeChild(index: number) {
    onChange({ ...action, actions: children.filter((_, i) => i !== index) });
  }

  function addChild() {
    onChange({ ...action, actions: [...children, { type: "SHOW_ALERT" }] });
  }

  return (
    <div className="space-y-3 pl-4 border-l-2 border-border-base">
      <Field label="สุ่มเลือกกี่ action">
        <Input type="number" min={1} value={action.pick ?? 1} onChange={(event) => onChange({ ...action, pick: Number(event.target.value) })} />
      </Field>
      {children.map((child, index) => (
        <ActionEditor
          key={index}
          action={child}
          widgets={widgets}
          mediaAssets={mediaAssets}
          onChange={(next) => updateChild(index, next)}
          onRemove={() => removeChild(index)}
          isRandomChild
        />
      ))}
      <button type="button" onClick={addChild} className="text-xs font-semibold text-primary hover:opacity-80">
        + เพิ่ม action ในกลุ่มสุ่ม
      </button>
    </div>
  );
}

function RuleEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ruleId = searchParams.get("id");
  const isNew = !ruleId;

  const [name, setName] = useState("Rule ใหม่");
  const [isEnabled, setIsEnabled] = useState(true);
  const [priority, setPriority] = useState(0);
  const [stopOnMatch, setStopOnMatch] = useState(false);
  const [eventTypes, setEventTypes] = useState<string[]>(["live.chat.message"]);
  const [conditions, setConditions] = useState<ConditionGroup>({ all: [] });
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [cooldownScope, setCooldownScope] = useState<"rule" | "user">("rule");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeTo, setActiveTo] = useState("");

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [testEventType, setTestEventType] = useState("live.chat.message");
  const [testPayload, setTestPayload] = useState(JSON.stringify(SAMPLE_PAYLOADS["live.chat.message"], null, 2));
  const [testResult, setTestResult] = useState<{ eventTypeMatches: boolean; matched: boolean; trace: TraceEntry[] } | null>(null);
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);

  function buildPayload() {
    return {
      name: name.trim(),
      isEnabled,
      priority,
      stopOnMatch,
      eventTypes,
      conditions,
      actions,
      cooldownSeconds,
      cooldownScope,
      activeFrom: activeFrom || null,
      activeTo: activeTo || null
    };
  }

  const isDirty = !loading && JSON.stringify(buildPayload()) !== initialSnapshot;
  const { UnsavedChangesModal } = useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    void Promise.all([api<Widget[]>("/widgets"), api<MediaAsset[]>("/media")])
      .then(([w, m]) => {
        setWidgets(w);
        setMediaAssets(m);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    if (isNew) {
      setInitialSnapshot(JSON.stringify(buildPayload()));
      return;
    }
    void api<RuleDetail>(`/rules/${ruleId}`)
      .then((rule) => {
        setName(rule.name);
        setIsEnabled(rule.isEnabled);
        setPriority(rule.priority);
        setStopOnMatch(rule.stopOnMatch);
        setEventTypes(rule.eventTypes);
        setConditions(rule.conditions ?? { all: [] });
        setActions(rule.actions ?? []);
        setCooldownSeconds(rule.cooldownSeconds);
        setCooldownScope(rule.cooldownScope === "user" ? "user" : "rule");
        setActiveFrom(rule.activeFrom ?? "");
        setActiveTo(rule.activeTo ?? "");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Rule ไม่สำเร็จ"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId, isNew]);

  useEffect(() => {
    if (loading || isNew) return;
    setInitialSnapshot((prev) => prev || JSON.stringify(buildPayload()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const availableFields = useMemo(() => {
    const set = new Set<string>();
    for (const type of eventTypes) for (const field of FIELD_OPTIONS[type] ?? []) set.add(field);
    return [...set];
  }, [eventTypes]);

  function toggleEventType(type: string) {
    setEventTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function addAction() {
    setActions((prev) => [...prev, { type: "SHOW_ALERT" }]);
  }

  function updateAction(index: number, next: RuleAction) {
    setActions((prev) => prev.map((a, i) => (i === index ? next : a)));
  }

  function removeAction(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("กรุณาใส่ชื่อ Rule");
      return;
    }
    if (eventTypes.length === 0) {
      setError("เลือก trigger อย่างน้อย 1 อย่าง");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = await api<{ id: string }>("/rules", { method: "POST", body: JSON.stringify(payload) });
        router.push(`/dashboard/rules/edit?id=${created.id}`);
      } else {
        await api(`/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setInitialSnapshot(JSON.stringify(payload));
        setMessage("บันทึก Rule แล้ว");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึก Rule ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (!ruleId) {
      setTestError("บันทึก Rule ก่อนถึงจะทดสอบได้");
      return;
    }
    setTesting(true);
    setTestError("");
    setTestResult(null);
    try {
      const payload = JSON.parse(testPayload);
      const result = await api<{ eventTypeMatches: boolean; matched: boolean; trace: TraceEntry[] }>(`/rules/${ruleId}/test`, {
        method: "POST",
        body: JSON.stringify({ eventType: testEventType, payload })
      });
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "ทดสอบไม่สำเร็จ — ตรวจสอบ JSON payload");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="แก้ไข Rule">
        <p className="text-sm text-ink-subtle">กำลังโหลด...</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={isNew ? "สร้าง Rule" : "แก้ไข Rule"}>
      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      <form className="space-y-6" onSubmit={submit}>
        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">พื้นฐาน</h2>
          <Field label="ชื่อ Rule">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ลำดับความสำคัญ" hint="เลขน้อย = ประเมินก่อน">
              <Input type="number" value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-ink-muted">
              <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
              เปิดใช้งาน
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-ink-muted">
              <input type="checkbox" checked={stopOnMatch} onChange={(event) => setStopOnMatch(event.target.checked)} />
              หยุดประเมิน rule อื่นถ้า match
            </label>
          </div>
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">Trigger</h2>
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-2 border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                  eventTypes.includes(option.value) ? "border-primary text-primary" : "border-border-base text-ink-subtle"
                }`}
              >
                <input type="checkbox" checked={eventTypes.includes(option.value)} onChange={() => toggleEventType(option.value)} />
                {option.label}
              </label>
            ))}
          </div>
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">เงื่อนไข</h2>
          <p className="text-xs text-ink-faint">ถ้าไม่เพิ่มเงื่อนไขเลย = ทำงานทุกครั้งที่มี trigger เกิดขึ้น</p>
          <ConditionGroupEditor node={conditions} fields={availableFields} onChange={setConditions} />
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Actions</h2>
            <button type="button" onClick={addAction} className="text-xs font-semibold text-primary hover:opacity-80">
              + เพิ่ม Action
            </button>
          </div>
          {actions.length === 0 ? <p className="text-xs text-ink-faint">ยังไม่มี action — เพิ่มอย่างน้อย 1 อย่างเพื่อให้ rule นี้มีผล</p> : null}
          {actions.map((action, index) => (
            <ActionEditor
              key={index}
              action={action}
              widgets={widgets}
              mediaAssets={mediaAssets}
              onChange={(next) => updateAction(index, next)}
              onRemove={() => removeAction(index)}
              isRandomChild={false}
            />
          ))}
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">จังหวะเวลา</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cooldown (วินาที)">
              <Input type="number" min={0} value={cooldownSeconds} onChange={(event) => setCooldownSeconds(Number(event.target.value))} />
            </Field>
            <Field label="ขอบเขต Cooldown">
              <Select value={cooldownScope} onChange={(event) => setCooldownScope(event.target.value === "user" ? "user" : "rule")}>
                <option value="rule">ทั้ง Rule</option>
                <option value="user">แยกตามผู้ใช้</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="เริ่มทำงาน (HH:mm)" hint="เว้นว่าง = ทำงานตลอดเวลา">
              <Input placeholder="20:00" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} />
            </Field>
            <Field label="สิ้นสุด (HH:mm)">
              <Input placeholder="23:59" value={activeTo} onChange={(event) => setActiveTo(event.target.value)} />
            </Field>
          </div>
        </ResourceCard>

        <div className="flex gap-3">
          <Button
            disabled={busy}
            type="submit"
            size="lg"
            className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold"
          >
            {busy ? "กำลังบันทึก..." : "บันทึก Rule"}
          </Button>
        </div>
      </form>

      <ResourceCard className="mt-8 space-y-4">
        <h2 className="text-lg font-bold text-white">ทดสอบ Rule</h2>
        {isNew ? <p className="text-xs text-amber-400">บันทึก Rule ก่อนถึงจะทดสอบได้</p> : null}
        <Field label="Event type ตัวอย่าง">
          <Select
            value={testEventType}
            onChange={(event) => {
              setTestEventType(event.target.value);
              setTestPayload(JSON.stringify(SAMPLE_PAYLOADS[event.target.value] ?? {}, null, 2));
            }}
          >
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payload (JSON)">
          <Textarea rows={6} value={testPayload} onChange={(event) => setTestPayload(event.target.value)} />
        </Field>
        <Button type="button" disabled={testing || isNew} onClick={() => void runTest()} variant="secondary">
          {testing ? "กำลังทดสอบ..." : "รันทดสอบ"}
        </Button>
        {testError ? <Notice tone="error">{testError}</Notice> : null}
        {testResult ? (
          <div className="space-y-2">
            <Notice tone={testResult.matched ? "success" : "info"}>
              {testResult.matched
                ? "Match — actions จะทำงาน"
                : testResult.eventTypeMatches
                  ? "เงื่อนไขไม่ผ่าน"
                  : "event type ไม่ตรงกับ trigger ของ rule นี้"}
            </Notice>
            {testResult.trace.map((entry, index) => (
              <div
                key={index}
                className={`border-2 px-3 py-2 text-xs font-semibold ${entry.passed ? "border-emerald-500 text-emerald-400" : "border-rose-500 text-rose-400"}`}
              >
                {entry.field} {entry.operator} {JSON.stringify(entry.expected)} — ค่าจริง: {JSON.stringify(entry.actual)} — {entry.passed ? "ผ่าน" : "ไม่ผ่าน"}
              </div>
            ))}
          </div>
        ) : null}
      </ResourceCard>

      {UnsavedChangesModal}
    </DashboardShell>
  );
}

export default function RuleEditPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-ink-subtle">กำลังโหลด...</div>}>
      <RuleEditContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @ezstream/web typecheck
```

Expected: exits 0. Fix any type errors (in particular, double-check `ConditionGroupEditor`'s kind-switch `onChange` call constructs a valid `ConditionGroup` — TypeScript may need the object literal typed explicitly, e.g. `(event.target.value === "all" ? { all: children } : { any: children })`, if the computed-key form doesn't narrow cleanly).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/rules/edit/page.tsx
git commit -m "web: add rule editor — condition builder, action editor, dry-run test panel"
```

---

## Task 22: Docs — remove the "no rule engine" caveats; end-to-end verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md` (only the specific "Rule Engine" claims, if present — check first)
- Modify: `PRODUCT.md` (only the specific "Rule Engine" claims, if present — check first)

**Interfaces:**
- Produces: docs match reality; a full manual smoke test confirms the rule engine works end-to-end.

- [ ] **Step 1: Update `CLAUDE.md`**

In `CLAUDE.md`, replace the block:

```
> **No rule engine exists.** README.md, PRODUCT.md, and earlier versions of this file describe a "Rule Engine" that lets creators define custom automation conditions. That feature was never built: there is no `Rule` model in the Prisma schema (only a vestigial, always-empty `EventLog.matchedRuleIds` column) and no rule-management UI. The only automation that actually runs is hardcoded in `live-events.service.ts`: every `live.chat.message` event auto-creates a TTS job from the creator's first enabled `TTS_WIDGET`. Gift/follow/like/share events are logged but trigger no widget action.
```

with:

```
> **The rule engine.** Creators define `Rule` rows (Prisma model, `packages/db/prisma/schema.prisma`) — trigger event types, a nested AND/OR condition tree, and an ordered list of actions (alert, sound, image, text, goal, event-list, TTS, or a random-pick group). `RuleEngineService` (`apps/api/src/rules/rule-engine.service.ts`) evaluates rules on every event in `LiveEventsService.processEvent` and writes real values into `EventLog.matchedRuleIds`. Managed from the dashboard at `/dashboard/rules`. On first boot, any creator with zero rules and an enabled `TTS_WIDGET` gets a default "read chat aloud" rule auto-created, preserving the old hardcoded behavior as an editable starting point.
```

Also find and update the sentence in the "Event → overlay flow" section:

```
3. `LiveEventsService.processEvent` logs the event and, **only for `live.chat.message`**, hardcodes a `TtsJob` from the creator's first enabled `TTS_WIDGET` (see the no-rule-engine note above). Other event types are logged only.
```

to:

```
3. `LiveEventsService.processEvent` logs the event and calls `RuleEngineService.evaluate` (`apps/api/src/rules/`), which matches the event against the creator's enabled `Rule` rows and runs their actions — `SPEAK_TTS` creates a `TtsJob`, everything else creates a `WidgetAction`.
```

- [ ] **Step 2: Check `README.md` and `PRODUCT.md` for the same claim and update if present**

```bash
grep -n -i "rule engine" README.md PRODUCT.md
```

For each match found, update the surrounding sentence to describe the rule engine as implemented (mirroring the `CLAUDE.md` wording above), rather than as a planned/nonexistent feature. If no matches are found in one of these files, leave it untouched.

- [ ] **Step 3: Commit the docs**

```bash
git add CLAUDE.md README.md PRODUCT.md
git commit -m "docs: describe the implemented rule engine instead of the no-rule-engine caveat"
```

- [ ] **Step 4: Full workspace verification**

```bash
pnpm typecheck
pnpm build
pnpm --filter @ezstream/api test
```

Expected: all three exit 0.

- [ ] **Step 5: End-to-end manual smoke test**

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

With both dev servers up:
1. Log in as `demo@example.com` / `password123`.
2. Go to `/dashboard/rules` — confirm both seeded rules ("อ่านแชทเป็นเสียง (TTS)" and "ขอบคุณสำหรับของขวัญ") appear.
3. Open the demo overlay browser-source URL (`/dashboard` → copy overlay URL → open in a new tab).
4. On `/dashboard`, click the "gift" mock-event tile. Confirm the alert widget on the overlay tab shows "ขอบคุณ tester สำหรับ Rose!" and disappears after ~5 seconds (Task 18's duration logic).
5. Click "gift" again within 3 seconds — confirm it does **not** re-fire (cooldown from the seed rule).
6. Click "chat" — confirm a `TtsJob` is created (check `/dashboard/tts` job history or server logs) using the seeded TTS rule.
7. On `/dashboard/rules/edit?id=<gift-rule-id>`, open the test panel, select "ได้รับของขวัญ", and run the dry-run test with `coins` below/above different thresholds if you add a condition — confirm the trace output shows pass/fail per condition.
8. Edit the gift rule's `stopOnMatch`/condition/action fields, save, and re-run steps 4-5 to confirm the change took effect (validates cache invalidation from Task 6/8).

Record the outcome in your final summary — this is the acceptance check for the whole plan, not just typechecking.

- [ ] **Step 6: No commit for this step** (Step 3 already committed the docs; Steps 4-5 are verification only, not code changes)
