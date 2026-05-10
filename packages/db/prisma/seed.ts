import { PrismaClient, WidgetType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const demoUserId = "demo_user";
const demoCreatorId = "demo_creator";
const mainOverlayId = "main_overlay";
const overlayToken = "demo_overlay_token_phase2";

const widgetIds = {
  chatAlert: "widget_chat_alert",
  tts: "widget_tts",
  goal: "widget_goal",
  eventList: "widget_event_list",
  sound: "widget_sound",
  text: "widget_text"
} as const;

async function upsertWidget(input: {
  id: string;
  type: WidgetType;
  name: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  config: object;
  state: object;
}) {
  await prisma.widget.upsert({
    where: { id: input.id },
    update: {
      type: input.type,
      name: input.name,
      positionX: input.positionX,
      positionY: input.positionY,
      width: input.width,
      height: input.height,
      zIndex: input.zIndex,
      config: input.config
    },
    create: {
      id: input.id,
      creatorId: demoCreatorId,
      overlayId: mainOverlayId,
      type: input.type,
      name: input.name,
      positionX: input.positionX,
      positionY: input.positionY,
      width: input.width,
      height: input.height,
      zIndex: input.zIndex,
      config: input.config,
      state: {
        create: {
          state: input.state
        }
      }
    }
  });

  await prisma.widgetState.upsert({
    where: { widgetId: input.id },
    update: { state: input.state },
    create: { widgetId: input.id, state: input.state }
  });
}

async function main() {
  await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {
      passwordHash: bcrypt.hashSync("password123", 10),
      role: "CREATOR"
    },
    create: {
      id: demoUserId,
      email: "demo@example.com",
      passwordHash: bcrypt.hashSync("password123", 10),
      role: "CREATOR"
    }
  });

  await prisma.creator.upsert({
    where: { slug: "demo_creator" },
    update: {
      displayName: "Demo Creator",
      settings: {
        bannedWords: ["badword"],
        ttsCooldownMs: 1500
      }
    },
    create: {
      id: demoCreatorId,
      userId: demoUserId,
      displayName: "Demo Creator",
      slug: "demo_creator",
      settings: {
        bannedWords: ["badword"],
        ttsCooldownMs: 1500
      }
    }
  });

  await prisma.overlay.upsert({
    where: { id: mainOverlayId },
    update: {
      name: "Main Overlay",
      token: overlayToken,
      width: 1920,
      height: 1080,
      isActive: true
    },
    create: {
      id: mainOverlayId,
      creatorId: demoCreatorId,
      name: "Main Overlay",
      token: overlayToken,
      width: 1920,
      height: 1080,
      isActive: true
    }
  });

  await upsertWidget({
    id: widgetIds.chatAlert,
    type: WidgetType.ALERT_WIDGET,
    name: "Chat Alert Widget",
    positionX: 660,
    positionY: 120,
    width: 600,
    height: 160,
    zIndex: 20,
    config: { template: "{username}: {message}", durationMs: 4000 },
    state: { visible: false, lastMessage: null }
  });

  await upsertWidget({
    id: widgetIds.tts,
    type: WidgetType.TTS_WIDGET,
    name: "TTS Widget",
    positionX: 0,
    positionY: 0,
    width: 1,
    height: 1,
    zIndex: 1,
    config: { voice: "default", speed: 1, pitch: 1, volume: 1 },
    state: { speaking: false, queueLength: 0 }
  });

  await upsertWidget({
    id: widgetIds.goal,
    type: WidgetType.GOAL_WIDGET,
    name: "Goal Widget",
    positionX: 60,
    positionY: 900,
    width: 520,
    height: 90,
    zIndex: 10,
    config: { label: "Rose Goal", target: 100 },
    state: { current: 0, target: 100 }
  });

  await upsertWidget({
    id: widgetIds.eventList,
    type: WidgetType.EVENT_LIST_WIDGET,
    name: "Event List Widget",
    positionX: 1460,
    positionY: 120,
    width: 380,
    height: 620,
    zIndex: 12,
    config: { maxItems: 10 },
    state: { items: [] }
  });

  await upsertWidget({
    id: widgetIds.sound,
    type: WidgetType.SOUND_WIDGET,
    name: "Sound Widget",
    positionX: 0,
    positionY: 0,
    width: 1,
    height: 1,
    zIndex: 1,
    config: { volume: 0.8 },
    state: { playing: false }
  });

  await upsertWidget({
    id: widgetIds.text,
    type: WidgetType.TEXT_WIDGET,
    name: "Text Widget",
    positionX: 60,
    positionY: 60,
    width: 480,
    height: 80,
    zIndex: 8,
    config: { text: "EZStream Demo", fontSize: 36 },
    state: { text: "EZStream Demo" }
  });

  await prisma.rule.upsert({
    where: { id: "rule_chat_hello" },
    update: {
      eventType: "live.chat.message",
      conditions: [{ field: "message", operator: "contains", value: "!hello" }],
      actions: [
        { type: "SHOW_ALERT", widgetId: widgetIds.chatAlert, textTemplate: "{username}: {message}" },
        { type: "SPEAK_TTS", widgetId: widgetIds.tts, textTemplate: "{username} said {message}" },
        { type: "APPEND_EVENT_LIST", widgetId: widgetIds.eventList, textTemplate: "{username}: {message}" }
      ]
    },
    create: {
      id: "rule_chat_hello",
      creatorId: demoCreatorId,
      overlayId: mainOverlayId,
      name: "Chat message contains !hello",
      eventType: "live.chat.message",
      conditions: [{ field: "message", operator: "contains", value: "!hello" }],
      actions: [
        { type: "SHOW_ALERT", widgetId: widgetIds.chatAlert, textTemplate: "{username}: {message}" },
        { type: "SPEAK_TTS", widgetId: widgetIds.tts, textTemplate: "{username} said {message}" },
        { type: "APPEND_EVENT_LIST", widgetId: widgetIds.eventList, textTemplate: "{username}: {message}" }
      ]
    }
  });

  await prisma.rule.upsert({
    where: { id: "rule_gift_rose" },
    update: {
      eventType: "live.gift.received",
      conditions: [{ field: "giftName", operator: "equals", value: "Rose" }],
      actions: [
        { type: "UPDATE_GOAL", widgetId: widgetIds.goal, amountTemplate: "{giftCount}" },
        { type: "PLAY_SOUND", widgetId: widgetIds.sound },
        { type: "SHOW_ALERT", widgetId: widgetIds.chatAlert, textTemplate: "{username} sent {giftName}" },
        { type: "APPEND_EVENT_LIST", widgetId: widgetIds.eventList, textTemplate: "{username} sent {giftName}" }
      ]
    },
    create: {
      id: "rule_gift_rose",
      creatorId: demoCreatorId,
      overlayId: mainOverlayId,
      name: "Rose gift updates goal",
      eventType: "live.gift.received",
      conditions: [{ field: "giftName", operator: "equals", value: "Rose" }],
      actions: [
        { type: "UPDATE_GOAL", widgetId: widgetIds.goal, amountTemplate: "{giftCount}" },
        { type: "PLAY_SOUND", widgetId: widgetIds.sound },
        { type: "SHOW_ALERT", widgetId: widgetIds.chatAlert, textTemplate: "{username} sent {giftName}" },
        { type: "APPEND_EVENT_LIST", widgetId: widgetIds.eventList, textTemplate: "{username} sent {giftName}" }
      ]
    }
  });

  await prisma.rule.upsert({
    where: { id: "rule_follow_alert" },
    update: {
      eventType: "live.follow.received",
      conditions: [],
      actions: [
        { type: "SHOW_ALERT", widgetId: widgetIds.chatAlert, textTemplate: "{username} followed!" },
        { type: "APPEND_EVENT_LIST", widgetId: widgetIds.eventList, textTemplate: "{username} followed!" }
      ]
    },
    create: {
      id: "rule_follow_alert",
      creatorId: demoCreatorId,
      overlayId: mainOverlayId,
      name: "Follow alert",
      eventType: "live.follow.received",
      conditions: [],
      actions: [
        { type: "SHOW_ALERT", widgetId: widgetIds.chatAlert, textTemplate: "{username} followed!" },
        { type: "APPEND_EVENT_LIST", widgetId: widgetIds.eventList, textTemplate: "{username} followed!" }
      ]
    }
  });

  console.log("Seed completed for demo@example.com / password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
