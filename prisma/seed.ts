/**
 * PostUp — Seed script (Phase 0 scaffold)
 *
 * Creates:
 *   - 2 demo users  (1 OVERSEER "admin", 1 MEMBER "alice")
 *   - 2 demo Hubs   ("gaming", "programming")
 *   - Both users as members of both Hubs (admin is WARDEN of both)
 *   - 1 TEXT Drop per Hub from each respective member
 *
 * Run via:  npx prisma db seed
 * Or:       npm run seed  (after adding the script to package.json)
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  console.log("=== PostUp seed starting ===\n");

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------
  const adminHash = await bcrypt.hash("admin-secret-123", SALT_ROUNDS);
  const aliceHash = await bcrypt.hash("alice-secret-456", SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: "admin@postup.dev" },
    update: {},
    create: {
      email: "admin@postup.dev",
      handle: "admin",
      displayName: "PostUp Admin",
      passwordHash: adminHash,
      role: "OVERSEER",
      bio: "Site-wide overseer. Here to keep things running smoothly.",
    },
  });
  console.log(`Created user: @${admin.handle} (${admin.role})`);

  const alice = await prisma.user.upsert({
    where: { email: "alice@postup.dev" },
    update: {},
    create: {
      email: "alice@postup.dev",
      handle: "alice",
      displayName: "Alice",
      passwordHash: aliceHash,
      role: "MEMBER",
      bio: "Long-time lurker, first-time poster.",
    },
  });
  console.log(`Created user: @${alice.handle} (${alice.role})`);

  // ------------------------------------------------------------------
  // Hubs
  // ------------------------------------------------------------------
  const gaming = await prisma.hub.upsert({
    where: { slug: "gaming" },
    update: {},
    create: {
      name: "Gaming",
      slug: "gaming",
      description: "Everything games — news, clips, hot takes, and more.",
      rules: "1. Be respectful.\n2. No piracy links.\n3. Tag spoilers.",
      nsfw: false,
      createdById: admin.id,
    },
  });
  console.log(`Created hub: h/${gaming.slug}`);

  const programming = await prisma.hub.upsert({
    where: { slug: "programming" },
    update: {},
    create: {
      name: "Programming",
      slug: "programming",
      description: "Code, architecture, tools, and the craft of software.",
      rules: "1. Be constructive.\n2. Minimal memes.\n3. Share context with questions.",
      nsfw: false,
      createdById: admin.id,
    },
  });
  console.log(`Created hub: h/${programming.slug}`);

  // ------------------------------------------------------------------
  // Memberships
  // ------------------------------------------------------------------
  for (const hub of [gaming, programming]) {
    await prisma.membership.upsert({
      where: { userId_hubId: { userId: admin.id, hubId: hub.id } },
      update: {},
      create: { userId: admin.id, hubId: hub.id, role: "WARDEN" },
    });

    await prisma.membership.upsert({
      where: { userId_hubId: { userId: alice.id, hubId: hub.id } },
      update: {},
      create: { userId: alice.id, hubId: hub.id, role: "MEMBER" },
    });
  }
  console.log("Memberships: admin=WARDEN & alice=MEMBER in both hubs");

  // ------------------------------------------------------------------
  // Drops
  // ------------------------------------------------------------------
  const gamingDrop = await prisma.drop.create({
    data: {
      title: "What game are you obsessing over this month?",
      type: "TEXT",
      body: "Drop your current obsession in the comments — no shame, all welcome.",
      hubId: gaming.id,
      authorId: alice.id,
    },
  });
  console.log(`Created Drop in h/${gaming.slug}: "${gamingDrop.title}"`);

  const programmingDrop = await prisma.drop.create({
    data: {
      title: "Welcome to h/programming — introduce yourself!",
      type: "TEXT",
      body: `## Welcome!\n\nThis is the official welcome thread for **h/programming** on PostUp.\n\nTell us:\n- What you build\n- Your favourite language\n- One thing you wish you'd learned sooner`,
      hubId: programming.id,
      authorId: admin.id,
    },
  });
  console.log(`Created Drop in h/${programming.slug}: "${programmingDrop.title}"`);

  console.log("\n=== Seed complete ===");
  console.log(`  Users:       ${await prisma.user.count()}`);
  console.log(`  Hubs:        ${await prisma.hub.count()}`);
  console.log(`  Memberships: ${await prisma.membership.count()}`);
  console.log(`  Drops:       ${await prisma.drop.count()}`);
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
