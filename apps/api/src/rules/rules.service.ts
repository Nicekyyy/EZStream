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
