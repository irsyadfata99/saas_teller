import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding plans...");

  await prisma.plan.upsert({
    where: { name: "Free" },
    update: {},
    create: {
      name: "Free",
      price: 0,
      maxProducts: 10,
      paymentGateway: false,
      customDomain: false,
      analytics: false,
    },
  });

  await prisma.plan.upsert({
    where: { name: "Starter" },
    update: {},
    create: {
      name: "Starter",
      price: 99000,
      maxProducts: 50,
      paymentGateway: true,
      customDomain: false,
      analytics: true,
    },
  });

  await prisma.plan.upsert({
    where: { name: "Pro" },
    update: {},
    create: {
      name: "Pro",
      price: 199000,
      maxProducts: 999999,
      paymentGateway: true,
      customDomain: true,
      analytics: true,
    },
  });

  console.log("✅ Seeding selesai.");
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
