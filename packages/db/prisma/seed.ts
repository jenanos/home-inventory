import {
  PrismaClient,
  Prisma,
  type BudgetCategory,
  type BudgetEntryType,
  type ItemStatus,
  type Phase,
  type Priority,
  type Role,
} from "@prisma/client"
import { DEFAULT_CATEGORIES } from "../src/seed-categories.js"

const prisma = new PrismaClient()
const runtime = globalThis as typeof globalThis & {
  process?: {
    exit?: (code?: number) => never
  }
}

const DEMO_HOUSEHOLD_NAME = "Demo Husstand - Solsiden 14"

const DEMO_USERS = [
  {
    email: "ida@demo.homeinventory.local",
    name: "Ida Solberg",
    role: "OWNER" as Role,
    image: "https://api.dicebear.com/9.x/initials/svg?seed=Ida%20Solberg",
  },
  {
    email: "marcus@demo.homeinventory.local",
    name: "Marcus Solberg",
    role: "MEMBER" as Role,
    image: "https://api.dicebear.com/9.x/initials/svg?seed=Marcus%20Solberg",
  },
  {
    email: "sara@demo.homeinventory.local",
    name: "Sara Nguyen",
    role: "MEMBER" as Role,
    image: "https://api.dicebear.com/9.x/initials/svg?seed=Sara%20Nguyen",
  },
  {
    email: "eirik@demo.homeinventory.local",
    name: "Eirik Dahl",
    role: "MEMBER" as Role,
    image: "https://api.dicebear.com/9.x/initials/svg?seed=Eirik%20Dahl",
  },
] as const

const EXTRA_CATEGORIES = [
  { name: "Barn", icon: "baby", color: "#F59E0B" },
  { name: "Kontor", icon: "briefcase", color: "#0F766E" },
  { name: "Hvitevarer", icon: "refrigerator", color: "#2563EB" },
  { name: "Smarthjem", icon: "house-plug", color: "#7C3AED" },
] as const

type SeedAlternative = {
  name: string
  price?: number
  url?: string
  imageUrl?: string
  storeName?: string
  notes?: string
}

type SeedItem = {
  name: string
  description?: string
  categoryName?: string
  priority?: Priority
  phase?: Phase
  dueInDays?: number
  estimatedPrice?: number
  url?: string
  imageUrl?: string
  storeName?: string
  assignedToEmail?: string
  status?: ItemStatus
  purchasedDaysAgo?: number
  alternatives?: SeedAlternative[]
}

type SeedList = {
  name: string
  shareLink?: {
    token: string
    createdByEmail: string
    expiresInDays?: number
    isActive?: boolean
  }
  items: SeedItem[]
}

const DEMO_LISTS: SeedList[] = [
  {
    name: "Innflytting - det viktigste",
    shareLink: {
      token: "demo-innflytting-solsiden14",
      createdByEmail: "ida@demo.homeinventory.local",
      expiresInDays: 30,
      isActive: true,
    },
    items: [
      {
        name: "Kontinentalseng 180x200",
        description: "Mork gratt stoff, oppbevaring i sokkel og fast madrass.",
        categoryName: "Soverom",
        priority: "HIGH",
        phase: "BEFORE_MOVE",
        dueInDays: 5,
        estimatedPrice: 12999,
        url: "https://www.ikea.com/no/no/search/?q=kontinentalseng",
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "ida@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Kontinentalseng med oppbevaring - 180x200",
            price: 12495,
            url: "https://www.bohus.no/sok?text=kontinentalseng",
            imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
            storeName: "Bohus",
            notes: "Best totalpris akkurat na, men 2 ukers levering.",
          },
          {
            name: "Rammemadrass + gavl - 180x200",
            price: 13990,
            url: "https://jysk.no/sok?query=seng%20180x200",
            imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
            storeName: "JYSK",
            notes: "Litt dyrere, men rask levering.",
          },
        ],
      },
      {
        name: "PAX garderobeskap til hovedsoverom",
        description: "Tre moduler med skuffer, stang og speildor mot gangen.",
        categoryName: "Møbler",
        priority: "HIGH",
        phase: "BEFORE_MOVE",
        dueInDays: 7,
        url: "https://www.ikea.com/no/no/search/?q=pax",
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "PAX 200 cm med speildorer",
            price: 10450,
            url: "https://www.ikea.com/no/no/search/?q=pax%20garderobe",
            imageUrl: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80",
            storeName: "IKEA",
            notes: "Billigst, men krever montering over to kvelder.",
          },
          {
            name: "Skyvedor garderobe 200 cm",
            price: 12999,
            url: "https://www.skeidar.no/sok/?query=garderobeskap",
            imageUrl: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80",
            storeName: "Skeidar",
            notes: "Ferdig losning, men dyrere.",
          },
          {
            name: "Brukt garderobeskap fra Finn",
            price: 3500,
            url: "https://www.finn.no/recommerce/forsale/search?q=garderobeskap",
            storeName: "FINN",
            notes: "Billig backup hvis budsjettet sprekker.",
          },
        ],
      },
      {
        name: "Vaskemaskin 8 kg",
        description: "Bor ha utsatt start, ullprogram og lavt stoyniva.",
        categoryName: "Hvitevarer",
        priority: "HIGH",
        phase: "BEFORE_MOVE",
        dueInDays: 3,
        estimatedPrice: 7499,
        url: "https://www.elkjop.no/search/vaskemaskin",
        imageUrl: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=800&q=80",
        storeName: "Elkjop",
        assignedToEmail: "sara@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Samsung 8 kg med damp",
            price: 6995,
            url: "https://www.power.no/search/?q=vaskemaskin",
            imageUrl: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=800&q=80",
            storeName: "POWER",
            notes: "Litt lavere pris, men mindre trommel.",
          },
          {
            name: "Bosch Serie 4 9 kg",
            price: 8999,
            url: "https://www.skousen.no/hvitevarer/vaskemaskin/",
            imageUrl: "https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=800&q=80",
            storeName: "Skousen",
            notes: "Dyrere, men best kapasitet.",
          },
        ],
      },
      {
        name: "Morkleggingsgardiner til hovedsoverom",
        description: "Skal dekke hele vindusbredden og passe med veggfargen.",
        categoryName: "Tekstiler",
        priority: "MEDIUM",
        phase: "FIRST_WEEK",
        dueInDays: 10,
        estimatedPrice: 1599,
        url: "https://www.kid.no/search?q=morkleggingsgardin",
        imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
        storeName: "Kid",
        assignedToEmail: "ida@demo.homeinventory.local",
        status: "PURCHASED",
        purchasedDaysAgo: 1,
      },
      {
        name: "Kommode til gjesterom",
        description: "Ble vurdert, men vi prioriterer brukte mobler senere.",
        categoryName: "Soverom",
        priority: "LOW",
        phase: "CAN_WAIT",
        dueInDays: 25,
        estimatedPrice: 2999,
        url: "https://www.ikea.com/no/no/search/?q=kommode",
        imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "SKIPPED",
      },
      {
        name: "Skohylle og dororganisering til entre",
        description: "Liten losning som tar lite gulvplass og samler nodvendige ting.",
        categoryName: "Oppbevaring",
        priority: "MEDIUM",
        phase: "FIRST_WEEK",
        dueInDays: 6,
        estimatedPrice: 899,
        url: "https://www.ikea.com/no/no/search/?q=skohylle",
        imageUrl: "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "eirik@demo.homeinventory.local",
        status: "PENDING",
      },
      {
        name: "Mesh WiFi-ruter",
        description: "Dekning i begge etasjer og ute pa balkongen.",
        categoryName: "Elektronikk",
        priority: "HIGH",
        phase: "BEFORE_MOVE",
        dueInDays: 2,
        url: "https://www.komplett.no/search?q=mesh%20wifi",
        imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80",
        storeName: "Komplett",
        assignedToEmail: "sara@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "TP-Link Deco 3-pack",
            price: 2690,
            url: "https://www.komplett.no/search?q=deco%20mesh",
            imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80",
            storeName: "Komplett",
            notes: "Best pris og dekning.",
          },
          {
            name: "Google Nest Wifi Pro 2-pack",
            price: 3490,
            url: "https://www.elkjop.no/search/google%20nest%20wifi",
            imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80",
            storeName: "Elkjop",
            notes: "Penest design og enklest app.",
          },
          {
            name: "ASUS ZenWiFi",
            price: 4290,
            url: "https://www.proshop.no/?s=zenwifi",
            storeName: "Proshop",
            notes: "Dyrest, men kraftigst.",
          },
        ],
      },
      {
        name: "Nokkelboks ved inngang",
        description: "For reservenokkel og enkel overlevering til handverkere.",
        priority: "LOW",
        phase: "NO_RUSH",
        dueInDays: 20,
        estimatedPrice: 349,
        url: "https://www.clasohlson.com/no/search?text=nokkelboks",
        imageUrl: "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80",
        storeName: "Clas Ohlson",
        status: "PENDING",
      },
    ],
  },
  {
    name: "Kjokken og forbruksvarer",
    shareLink: {
      token: "demo-kjokken-solsiden14",
      createdByEmail: "marcus@demo.homeinventory.local",
      expiresInDays: 7,
      isActive: false,
    },
    items: [
      {
        name: "Kasserollesett med tre gryter",
        description: "Induksjon, lokk til alle grytene og plassbesparende handtak.",
        categoryName: "Kjøkken",
        priority: "HIGH",
        phase: "FIRST_WEEK",
        dueInDays: 4,
        estimatedPrice: 1999,
        url: "https://www.kitchn.no/sok/?q=kasserollesett",
        imageUrl: "https://images.unsplash.com/photo-1584990347449-4f7d1f90c6f3?auto=format&fit=crop&w=800&q=80",
        storeName: "Kitchn",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Jamie Oliver 3-delt grytesett",
            price: 1799,
            url: "https://www.tilbords.no/search?text=grytesett",
            storeName: "Tilbords",
            notes: "Billigst av de nye alternativene.",
          },
          {
            name: "WMF grytesett 4 deler",
            price: 2599,
            url: "https://www.kitchn.no/sok/?q=wmf%20grytesett",
            storeName: "Kitchn",
            notes: "Best kvalitet, men over budsjett.",
          },
        ],
      },
      {
        name: "Bestikksett 12 personer",
        description: "Rustfritt, matt finish og ekstra serveringsskjeer.",
        categoryName: "Kjøkken",
        priority: "MEDIUM",
        phase: "FIRST_WEEK",
        dueInDays: 3,
        estimatedPrice: 699,
        url: "https://www.ikea.com/no/no/search/?q=bestikksett",
        imageUrl: "https://images.unsplash.com/photo-1464306076886-da185f6a9d05?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "ida@demo.homeinventory.local",
        status: "PURCHASED",
        purchasedDaysAgo: 3,
      },
      {
        name: "Tallerkensett 8 kuverter",
        description: "Nok til bade hverdagsbruk og noen gjester.",
        categoryName: "Kjøkken",
        priority: "MEDIUM",
        phase: "FIRST_WEEK",
        dueInDays: 5,
        estimatedPrice: 899,
        url: "https://www.ikea.com/no/no/search/?q=tallerkensett",
        imageUrl: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "eirik@demo.homeinventory.local",
        status: "PENDING",
      },
      {
        name: "Kaffetrakter med timer",
        description: "Borde kunne lage full kanne og ha avtakbar vanntank.",
        categoryName: "Kjøkken",
        priority: "HIGH",
        phase: "FIRST_WEEK",
        dueInDays: 2,
        url: "https://www.elkjop.no/search/kaffetrakter",
        imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
        storeName: "Elkjop",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Wilfa Performance Compact",
            price: 1499,
            url: "https://www.elkjop.no/search/wilfa%20kaffetrakter",
            imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
            storeName: "Elkjop",
            notes: "Beste bryggekvalitet.",
          },
          {
            name: "Moccamaster Cup-One",
            price: 2290,
            url: "https://www.power.no/search/?q=moccamaster",
            storeName: "POWER",
            notes: "For liten kapasitet for oss.",
          },
          {
            name: "Philips Daily Collection",
            price: 799,
            url: "https://www.clasohlson.com/no/search?text=kaffetrakter",
            storeName: "Clas Ohlson",
            notes: "Billigst, men enklest funksjoner.",
          },
        ],
      },
      {
        name: "Robotstovsuger",
        description: "Skal ha kartlegging og være grei med terskler.",
        categoryName: "Rengjøring",
        priority: "LOW",
        phase: "CAN_WAIT",
        dueInDays: 35,
        imageUrl: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=800&q=80",
        storeName: "Komplett",
        assignedToEmail: "sara@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Roborock Q Revo",
            price: 7490,
            url: "https://www.komplett.no/search?q=roborock",
            imageUrl: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=800&q=80",
            storeName: "Komplett",
            notes: "Mest funksjon for pengene.",
          },
          {
            name: "iRobot Roomba Combo",
            price: 8990,
            url: "https://www.elkjop.no/search/roomba",
            storeName: "Elkjop",
            notes: "Mer kjent merke, men dyrere.",
          },
          {
            name: "Dreame D10",
            price: 3990,
            url: "https://www.power.no/search/?q=dreame%20robotstovsuger",
            storeName: "POWER",
            notes: "Budgetvalg uten auto-toem.",
          },
        ],
      },
      {
        name: "Startpakke vaskemidler og kluter",
        description: "Allrengjoring, baderom, glass, mikrofiber og hansker.",
        categoryName: "Rengjøring",
        priority: "HIGH",
        phase: "FIRST_WEEK",
        dueInDays: 1,
        estimatedPrice: 489,
        url: "https://www.normal.no/search?query=rengjoring",
        imageUrl: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80",
        storeName: "Normal",
        assignedToEmail: "eirik@demo.homeinventory.local",
        status: "PURCHASED",
        purchasedDaysAgo: 2,
      },
      {
        name: "Glassmatbokser til restemat",
        description: "Stablebare bokser til kjøleskap og fryser.",
        categoryName: "Oppbevaring",
        priority: "LOW",
        phase: "NO_RUSH",
        dueInDays: 18,
        estimatedPrice: 349,
        url: "https://www.ikea.com/no/no/search/?q=matboks%20glass",
        imageUrl: "https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        status: "PENDING",
      },
      {
        name: "Barnestol til spisebord",
        description: "Trengs bare hvis nevobesok blir faste hos oss.",
        categoryName: "Barn",
        priority: "MEDIUM",
        phase: "CAN_WAIT",
        dueInDays: 40,
        estimatedPrice: 1599,
        url: "https://www.jollyroom.no/search?query=barnestol",
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
        storeName: "Jollyroom",
        assignedToEmail: "ida@demo.homeinventory.local",
        status: "SKIPPED",
      },
    ],
  },
  {
    name: "Stue og hjemmekontor",
    items: [
      {
        name: "Modulsofa 3-seter",
        description: "Lysebeige trekk, god dybde og plass til overnatting.",
        categoryName: "Stue",
        priority: "HIGH",
        phase: "BEFORE_MOVE",
        dueInDays: 12,
        imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
        storeName: "Bohus",
        assignedToEmail: "ida@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Bohus Modulsofa 290 cm",
            price: 18995,
            url: "https://www.bohus.no/sok?text=modulsofa",
            imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
            storeName: "Bohus",
            notes: "Favoritten pa komfort.",
          },
          {
            name: "Skeidar loungesofa",
            price: 15999,
            url: "https://www.skeidar.no/sok/?query=sofa",
            storeName: "Skeidar",
            notes: "Billigere, men lavere rygg.",
          },
          {
            name: "FINN brukt sofa",
            price: 6500,
            url: "https://www.finn.no/recommerce/forsale/search?q=sofa",
            storeName: "FINN",
            notes: "Kan bli plan B hvis leveringstid blir et problem.",
          },
        ],
      },
      {
        name: "Gulvlampe ved sofaen",
        description: "Mykt lys til lesekroken og dimmer pa ledningen.",
        categoryName: "Belysning",
        priority: "MEDIUM",
        phase: "FIRST_WEEK",
        dueInDays: 7,
        estimatedPrice: 1299,
        url: "https://www.ikea.com/no/no/search/?q=gulvlampe",
        imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "eirik@demo.homeinventory.local",
        status: "PURCHASED",
        purchasedDaysAgo: 5,
      },
      {
        name: "TV-benk med skjult kabelspor",
        description: "Maste passe 65 tommer TV og spillkonsoll.",
        categoryName: "Stue",
        priority: "MEDIUM",
        phase: "CAN_WAIT",
        dueInDays: 22,
        estimatedPrice: 2499,
        url: "https://www.ikea.com/no/no/search/?q=tv-benk",
        imageUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "PENDING",
      },
      {
        name: "27 tommer skjerm til hjemmekontor",
        description: "USB-C er et pluss, men ikke et krav.",
        categoryName: "Kontor",
        priority: "HIGH",
        phase: "FIRST_WEEK",
        dueInDays: 6,
        estimatedPrice: 2995,
        url: "https://www.komplett.no/search?q=27%20tommer%20skjerm",
        imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=800&q=80",
        storeName: "Komplett",
        assignedToEmail: "sara@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Dell UltraSharp 27",
            price: 3290,
            url: "https://www.dustin.no/search/dell%2027",
            storeName: "Dustin",
            notes: "Best panel, litt over budsjett.",
          },
          {
            name: "Samsung ViewFinity S6",
            price: 2790,
            url: "https://www.elkjop.no/search/viewfinity",
            storeName: "Elkjop",
            notes: "Rimeligste nye kandidat.",
          },
        ],
      },
      {
        name: "Ergonomisk kontorstol",
        description: "Bor testes i butikk for sittekomfort over lange dager.",
        categoryName: "Kontor",
        priority: "HIGH",
        phase: "FIRST_WEEK",
        dueInDays: 8,
        estimatedPrice: 3790,
        url: "https://www.ajprodukter.no/kontor-konferanse/kontorstoler",
        imageUrl: "https://images.unsplash.com/photo-1505843490701-5be5d6483f91?auto=format&fit=crop&w=800&q=80",
        storeName: "AJ Produkter",
        assignedToEmail: "eirik@demo.homeinventory.local",
        status: "PENDING",
      },
      {
        name: "Trådløs skriver",
        description: "Ble vurdert, men vi prover a klare oss uten fast skriver.",
        categoryName: "Kontor",
        priority: "LOW",
        phase: "NO_RUSH",
        dueInDays: 30,
        estimatedPrice: 1490,
        url: "https://www.elkjop.no/search/skriver",
        imageUrl: "https://images.unsplash.com/photo-1612817159949-195b6eb9e31a?auto=format&fit=crop&w=800&q=80",
        storeName: "Elkjop",
        assignedToEmail: "sara@demo.homeinventory.local",
        status: "SKIPPED",
      },
      {
        name: "Kabelrenne og kabelclips",
        description: "Sma grep for at stue og kontor ser ryddige ut.",
        priority: "LOW",
        estimatedPrice: 179,
        url: "https://www.clasohlson.com/no/search?text=kabelclips",
        imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
        storeName: "Clas Ohlson",
        status: "PENDING",
      },
      {
        name: "Smartpærer 6-pk",
        description: "Skal kunne styres i samme app som lyslenkene ute.",
        categoryName: "Smarthjem",
        priority: "MEDIUM",
        phase: "CAN_WAIT",
        dueInDays: 16,
        imageUrl: "https://images.unsplash.com/photo-1518444065439-e933c06ce9cd?auto=format&fit=crop&w=800&q=80",
        storeName: "Clas Ohlson",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Philips Hue White Ambiance 6-pk",
            price: 899,
            url: "https://www.clasohlson.com/no/search?text=philips%20hue",
            storeName: "Clas Ohlson",
            notes: "Enkelt oppsett og stabil app.",
          },
          {
            name: "IKEA TRADFRI 6-pk",
            price: 549,
            url: "https://www.ikea.com/no/no/search/?q=tradfri",
            storeName: "IKEA",
            notes: "Billigst hvis vi tar hub senere.",
          },
        ],
      },
    ],
  },
  {
    name: "Uteomrade og bod",
    items: [
      {
        name: "Gresstrimmer",
        description: "Til smale kanter og rundt leveggen pa baksiden.",
        categoryName: "Hage",
        priority: "MEDIUM",
        phase: "CAN_WAIT",
        dueInDays: 28,
        estimatedPrice: 1699,
        url: "https://www.jula.no/search/?query=gresstrimmer",
        imageUrl: "https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=800&q=80",
        storeName: "Jula",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "PENDING",
      },
      {
        name: "Hageslange med trommel",
        description: "Praktisk for vasking av terrasse og vanning av krukker.",
        categoryName: "Hage",
        priority: "LOW",
        phase: "NO_RUSH",
        dueInDays: 21,
        estimatedPrice: 899,
        url: "https://www.biltema.no/sok/?query=hageslange",
        imageUrl: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80",
        storeName: "Biltema",
        status: "PENDING",
      },
      {
        name: "Verktøykasse med basisutstyr",
        description: "Hammer, bitssett, målebånd, tang og skrujern.",
        categoryName: "Verktøy",
        priority: "MEDIUM",
        phase: "FIRST_WEEK",
        dueInDays: 4,
        estimatedPrice: 799,
        url: "https://www.jula.no/search/?query=verkt%C3%B8ykasse",
        imageUrl: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80",
        storeName: "Jula",
        assignedToEmail: "eirik@demo.homeinventory.local",
        status: "PURCHASED",
        purchasedDaysAgo: 4,
      },
      {
        name: "3-delt stige",
        description: "Trengs for lamper, maling og henge opp gardinskinner.",
        categoryName: "Verktøy",
        priority: "HIGH",
        phase: "BEFORE_MOVE",
        dueInDays: 2,
        estimatedPrice: 1899,
        url: "https://www.obsbygg.no/search?query=stige",
        imageUrl: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80",
        storeName: "Obs BYGG",
        assignedToEmail: "marcus@demo.homeinventory.local",
        status: "PENDING",
      },
      {
        name: "Gjennomsiktige oppbevaringsbokser 6 stk",
        description: "Til sesongutstyr, skruer og kabelrot i boden.",
        categoryName: "Oppbevaring",
        priority: "MEDIUM",
        phase: "FIRST_WEEK",
        dueInDays: 9,
        estimatedPrice: 549,
        url: "https://www.ikea.com/no/no/search/?q=oppbevaringsboks",
        imageUrl: "https://images.unsplash.com/photo-1584473457409-ce8a7c7c833d?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        assignedToEmail: "ida@demo.homeinventory.local",
        status: "PENDING",
      },
      {
        name: "Baderomsspeil med lys",
        description: "Nytt speil til gjestebadet nede ved entreen.",
        categoryName: "Bad",
        priority: "MEDIUM",
        phase: "CAN_WAIT",
        dueInDays: 24,
        imageUrl: "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=800&q=80",
        storeName: "Megaflis",
        assignedToEmail: "sara@demo.homeinventory.local",
        status: "PENDING",
        alternatives: [
          {
            name: "Rundt speil 80 cm med LED",
            price: 3299,
            url: "https://www.megaflis.no/search?text=led-speil",
            imageUrl: "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=800&q=80",
            storeName: "Megaflis",
            notes: "Favoritt til gjestebadet.",
          },
          {
            name: "Speilskap med lyslist",
            price: 2890,
            url: "https://www.ikea.com/no/no/search/?q=speilskap",
            storeName: "IKEA",
            notes: "Gir ekstra oppbevaring, men mindre elegant.",
          },
        ],
      },
      {
        name: "Kroker til bod og entre",
        description: "Enkle kroker til sekker, jakker og handlenett.",
        categoryName: "Annet",
        priority: "LOW",
        estimatedPrice: 199,
        url: "https://www.clasohlson.com/no/search?text=kroker",
        imageUrl: "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80",
        storeName: "Clas Ohlson",
        status: "PENDING",
      },
      {
        name: "Lite utebord til balkongen",
        description: "Har lav prioritet siden vi kan vente til våren er ordentlig i gang.",
        categoryName: "Møbler",
        priority: "LOW",
        phase: "NO_RUSH",
        dueInDays: 45,
        estimatedPrice: 3299,
        url: "https://www.ikea.com/no/no/search/?q=utebord",
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
        storeName: "IKEA",
        status: "SKIPPED",
      },
    ],
  },
]

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate)
  next.setDate(next.getDate() + days)
  return next
}

function assertMapValue(
  map: Map<string, string>,
  key: string,
  label: string
): string {
  const value = map.get(key)
  if (!value) {
    throw new Error(`Fant ikke ${label}: ${key}`)
  }
  return value
}

async function upsertDemoUsers() {
  const verifiedAt = addDays(new Date(), -14)

  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        image: user.image,
        emailVerified: verifiedAt,
      },
      create: {
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: verifiedAt,
      },
    })
  }

  const users = await prisma.user.findMany({
    where: {
      email: {
        in: DEMO_USERS.map((user) => user.email),
      },
    },
  })

  return new Map(users.map((user) => [user.email, user.id]))
}

async function createDemoHousehold(userIdByEmail: Map<string, string>) {
  const categorySeeds = [...DEFAULT_CATEGORIES, ...EXTRA_CATEGORIES]

  const household = await prisma.household.create({
    data: {
      name: DEMO_HOUSEHOLD_NAME,
      members: {
        create: DEMO_USERS.map((user) => ({
          userId: assertMapValue(userIdByEmail, user.email, "bruker"),
          role: user.role,
        })),
      },
      categories: {
        createMany: {
          data: categorySeeds.map((category) => ({
            name: category.name,
            icon: category.icon,
            color: category.color,
            isDefault: DEFAULT_CATEGORIES.some(
              (defaultCategory: (typeof DEFAULT_CATEGORIES)[number]) =>
                defaultCategory.name === category.name
            ),
          })),
        },
      },
    },
  })

  const categories = await prisma.category.findMany({
    where: { householdId: household.id },
  })
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]))

  const now = new Date()

  for (const seedList of DEMO_LISTS) {
    const list = await prisma.shoppingList.create({
      data: {
        name: seedList.name,
        householdId: household.id,
      },
    })

    for (const item of seedList.items) {
      await prisma.shoppingItem.create({
        data: {
          name: item.name,
          description: item.description,
          categoryId: item.categoryName
            ? assertMapValue(categoryIdByName, item.categoryName, "kategori")
            : undefined,
          priority: item.priority ?? "MEDIUM",
          phase: item.phase,
          dueDate: typeof item.dueInDays === "number" ? addDays(now, item.dueInDays) : undefined,
          estimatedPrice: item.estimatedPrice,
          url: item.url,
          imageUrl: item.imageUrl,
          storeName: item.storeName,
          assignedToId: item.assignedToEmail
            ? assertMapValue(userIdByEmail, item.assignedToEmail, "bruker")
            : undefined,
          status: item.status ?? "PENDING",
          purchasedAt:
            item.status === "PURCHASED" && typeof item.purchasedDaysAgo === "number"
              ? addDays(now, -item.purchasedDaysAgo)
              : item.status === "PURCHASED"
                ? now
                : undefined,
          listId: list.id,
          alternatives: item.alternatives?.length
            ? {
                create: item.alternatives.map((alternative, index) => ({
                  name: alternative.name,
                  price: alternative.price,
                  url: alternative.url,
                  imageUrl: alternative.imageUrl,
                  storeName: alternative.storeName,
                  notes: alternative.notes,
                  rank: index,
                })),
              }
            : undefined,
        },
      })
    }

    if (seedList.shareLink) {
      await prisma.shareLink.create({
        data: {
          token: seedList.shareLink.token,
          listId: list.id,
          createdBy: assertMapValue(
            userIdByEmail,
            seedList.shareLink.createdByEmail,
            "bruker for delingslenke"
          ),
          expiresAt:
            typeof seedList.shareLink.expiresInDays === "number"
              ? addDays(now, seedList.shareLink.expiresInDays)
              : undefined,
          isActive: seedList.shareLink.isActive ?? true,
        },
      })
    }
  }

  // ─── Budget seed data ────────────────────────────────────────
  await prisma.budget.create({
    data: {
      householdId: household.id,
      taxDeductionPercent: 22,
      members: {
        create: [
          {
            name: "Ida Solberg",
            grossMonthlyIncome: 52000,
            taxPercent: 34,
            sortOrder: 0,
          },
          {
            name: "Marcus Solberg",
            grossMonthlyIncome: 48000,
            taxPercent: 32,
            sortOrder: 1,
          },
        ],
      },
      loans: {
        create: [
          {
            bankName: "Nordea",
            loanName: "Boliglån",
            monthlyInterest: 6200,
            monthlyPrincipal: 3800,
            monthlyFees: 50,
            sortOrder: 0,
          },
          {
            bankName: "DNB",
            loanName: "Billån",
            monthlyInterest: 850,
            monthlyPrincipal: 2600,
            monthlyFees: 0,
            sortOrder: 1,
          },
        ],
      },
      entries: {
        create: [
          // Housing costs
          {
            name: "Strøm",
            category: "ELECTRICITY" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 2500,
            sortOrder: 0,
          },
          {
            name: "Kommunale avgifter",
            category: "MUNICIPAL_FEES" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 3200,
            sortOrder: 1,
          },
          {
            name: "Forsikring bolig og innbo",
            category: "INSURANCE" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 1200,
            sortOrder: 2,
          },
          {
            name: "Vedlikehold",
            category: "HOME_MAINTENANCE" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 1500,
            sortOrder: 3,
          },
          // Fixed costs
          {
            name: "Bil og kollektiv",
            category: "TRANSPORT" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 4500,
            sortOrder: 4,
          },
          {
            name: "Streaming og mobil",
            category: "SUBSCRIPTIONS" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 1800,
            sortOrder: 5,
          },
          {
            name: "Dagligvarer",
            category: "FOOD" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 8000,
            sortOrder: 6,
          },
          {
            name: "Personlig forbruk",
            category: "PERSONAL" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 3000,
            sortOrder: 7,
          },
          {
            name: "Sparing",
            category: "SAVINGS" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 5000,
            sortOrder: 8,
          },
          {
            name: "Buffer",
            category: "BUFFER" as BudgetCategory,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 2000,
            sortOrder: 9,
          },
          // Manual entries
          {
            name: "Utleie av hybel",
            category: null,
            type: "INCOME" as BudgetEntryType,
            monthlyAmount: 6000,
            sortOrder: 10,
          },
          {
            name: "Treningsabonnement",
            category: null,
            type: "EXPENSE" as BudgetEntryType,
            monthlyAmount: 800,
            sortOrder: 11,
          },
        ],
      },
    },
  })
  console.log("  Opprettet demo-budsjett")

  return household
}

async function ensureDefaultCategoriesForAllHouseholds() {
  const households = await prisma.household.findMany({
    select: { id: true, name: true },
  })

  for (const household of households) {
    for (const category of DEFAULT_CATEGORIES) {
      await prisma.category.upsert({
        where: {
          name_householdId: {
            name: category.name,
            householdId: household.id,
          },
        },
        update: {
          icon: category.icon,
          color: category.color,
          isDefault: true,
        },
        create: {
          name: category.name,
          icon: category.icon,
          color: category.color,
          householdId: household.id,
          isDefault: true,
        },
      })
    }

    console.log(`  Sikret default-kategorier for husstand: ${household.name}`)
  }
}

async function main() {
  console.log("Starter seeding av demo-data...")

  const userIdByEmail = await upsertDemoUsers()
  console.log(`  Klargjorde ${DEMO_USERS.length} demo-brukere`)

  const deleted = await prisma.household.deleteMany({
    where: { name: DEMO_HOUSEHOLD_NAME },
  })
  if (deleted.count > 0) {
    console.log(`  Fjernet ${deleted.count} eksisterende demo-husstand(er)`)
  }

  const household = await createDemoHousehold(userIdByEmail)
  console.log(`  Opprettet demo-husstand: ${household.name}`)

  await ensureDefaultCategoriesForAllHouseholds()

  const [listCount, itemCount, alternativeCount] = await Promise.all([
    prisma.shoppingList.count({ where: { householdId: household.id } }),
    prisma.shoppingItem.count({
      where: { list: { householdId: household.id } },
    }),
    prisma.productAlternative.count({
      where: { item: { list: { householdId: household.id } } },
    }),
  ])

  console.log(
    `Seed ferdig. Demo-husstanden har ${listCount} lister, ${itemCount} elementer og ${alternativeCount} alternativer.`
  )
  console.log("Demo-brukere:")
  for (const user of DEMO_USERS) {
    console.log(`  - ${user.name} <${user.email}>`)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021") {
        console.error(
          "Seed stoppet fordi databasetabellene mangler. Kjor `pnpm db:migrate` eller `pnpm db:setup` forst."
        )
      } else {
        console.error(error)
      }
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error(
        "Seed fikk ikke kontakt med databasen. Start Postgres med `docker compose up -d` og prover igjen."
      )
    } else {
      console.error(error)
    }
    await prisma.$disconnect()
    runtime.process?.exit?.(1)
  })
