import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const DEFAULT_CATEGORIES = [
  { name: "Møbler", icon: "sofa", color: "#8B6F47" },
  { name: "Elektronikk", icon: "monitor", color: "#4A6FA5" },
  { name: "Kjøkken", icon: "chef-hat", color: "#C17817" },
  { name: "Bad", icon: "bath", color: "#5B9BD5" },
  { name: "Soverom", icon: "bed-double", color: "#7B68AE" },
  { name: "Stue", icon: "lamp", color: "#D4A853" },
  { name: "Verktøy", icon: "wrench", color: "#6B7280" },
  { name: "Hage", icon: "flower-2", color: "#6B8E4E" },
  { name: "Rengjøring", icon: "sparkles", color: "#2BAAE2" },
  { name: "Tekstiler", icon: "shirt", color: "#C06B8A" },
  { name: "Belysning", icon: "lightbulb", color: "#EAB308" },
  { name: "Oppbevaring", icon: "archive", color: "#8B7355" },
  { name: "Annet", icon: "box", color: "#9CA3AF" },
]

async function main() {
  console.log("Seeding default categories...")

  // Get all households to seed categories into
  const households = await prisma.household.findMany()

  for (const household of households) {
    for (const cat of DEFAULT_CATEGORIES) {
      await prisma.category.upsert({
        where: {
          name_householdId: {
            name: cat.name,
            householdId: household.id,
          },
        },
        update: {},
        create: {
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          householdId: household.id,
          isDefault: true,
        },
      })
    }
    console.log(`  Seeded categories for household: ${household.name}`)
  }

  console.log("Seed complete.")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
