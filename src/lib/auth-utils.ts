import { auth } from "@/auth"

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Response("Unauthorized", { status: 401 })
  }
  return user
}
