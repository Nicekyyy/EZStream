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
