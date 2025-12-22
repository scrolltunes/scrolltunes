import { db } from "@/lib/db"
import { appUserProfiles, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

async function main() {
  const email = process.argv[2]

  if (!email) {
    console.error("Usage: bun scripts/set-admin.ts <email>")
    process.exit(1)
  }

  const [user] = await db.select().from(users).where(eq(users.email, email))

  if (!user) {
    console.error(`User not found: ${email}`)
    process.exit(1)
  }

  const [profile] = await db
    .select()
    .from(appUserProfiles)
    .where(eq(appUserProfiles.userId, user.id))

  if (!profile) {
    console.error(`Profile not found for user: ${email}`)
    console.error("User must log in and accept consent first.")
    process.exit(1)
  }

  await db.update(appUserProfiles).set({ isAdmin: true }).where(eq(appUserProfiles.userId, user.id))

  console.log(`✓ ${email} is now an admin`)
}

main().catch(console.error)
