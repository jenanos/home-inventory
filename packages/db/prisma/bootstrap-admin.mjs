import { PrismaClient } from "@prisma/client";

async function bootstrapAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.log("ADMIN_EMAIL not set, skipping admin bootstrap.");
    return;
  }

  const db = new PrismaClient();
  try {
    const user = await db.user.upsert({
      where: { email: adminEmail },
      update: { isAdmin: true },
      create: { email: adminEmail, isAdmin: true },
    });
    console.log(`Admin user ensured: ${user.email} (id: ${user.id})`);
  } finally {
    await db.$disconnect();
  }
}

bootstrapAdmin().catch((err) => {
  console.error("Failed to bootstrap admin:", err);
  process.exit(1);
});
