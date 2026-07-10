import { PrismaClient, WidgetType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const demoUserId = "demo_user";
const demoCreatorId = "demo_creator";
const mainOverlayId = "main_overlay";
const overlayToken = "demo_overlay_token_phase2";

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

  console.log("Seed completed for demo@example.com / password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.\\\();
  });
