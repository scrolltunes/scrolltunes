import { encryptToken } from "@/lib/crypto"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth, { type DefaultSession } from "next-auth"
import Google from "next-auth/providers/google"
import Spotify from "next-auth/providers/spotify"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
    } & DefaultSession["user"]
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "user-read-email user-read-private",
        },
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, account }) {
      if (user?.id) {
        token.id = user.id
      }

      if (account?.provider === "spotify") {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
      }

      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (isNewUser && user.id) {
        await db.insert(schema.appUserProfiles).values({
          userId: user.id,
          consentVersion: "2025-accounts-v1",
          consentGivenAt: new Date(),
        })
      }

      if (
        account?.provider === "spotify" &&
        user.id &&
        account.access_token &&
        account.refresh_token &&
        account.expires_at
      ) {
        const expiresAt = new Date(account.expires_at * 1000)

        await db
          .insert(schema.userSpotifyTokens)
          .values({
            userId: user.id,
            accessTokenEncrypted: encryptToken(account.access_token),
            refreshTokenEncrypted: encryptToken(account.refresh_token),
            expiresAt,
          })
          .onConflictDoUpdate({
            target: schema.userSpotifyTokens.userId,
            set: {
              accessTokenEncrypted: encryptToken(account.access_token),
              refreshTokenEncrypted: encryptToken(account.refresh_token),
              expiresAt,
              updatedAt: new Date(),
            },
          })
      }
    },
  },
})
