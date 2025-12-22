"use client"

import type { Session } from "next-auth"
import { useSyncExternalStore } from "react"

export interface AccountUser {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly image: string | null
}

export interface AccountProfile {
  readonly consentVersion: string
  readonly displayName: string | null
  readonly isAdmin: boolean
}

export interface AccountState {
  readonly isAuthenticated: boolean
  readonly isLoading: boolean
  readonly user: AccountUser | null
  readonly profile: AccountProfile | null
  readonly lastSyncAt: Date | null
  readonly isSyncing: boolean
}

const DEFAULT_STATE: AccountState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  profile: null,
  lastSyncAt: null,
  isSyncing: false,
}

export class AccountStore {
  private listeners = new Set<() => void>()
  private state: AccountState = DEFAULT_STATE

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): AccountState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private setState(partial: Partial<AccountState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  async initialize(): Promise<void> {
    this.setState({ isLoading: true })

    try {
      const response = await fetch("/api/user/me")

      if (!response.ok) {
        this.setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          profile: null,
        })
        return
      }

      const data = (await response.json()) as {
        user: AccountUser | null
        profile: AccountProfile | null
      }

      this.setState({
        isAuthenticated: data.user !== null,
        isLoading: false,
        user: data.user,
        profile: data.profile,
      })
    } catch {
      this.setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        profile: null,
      })
    }
  }

  initializeFromSession(session: Session | null): void {
    if (session?.user) {
      this.setState({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: session.user.id,
          email: session.user.email ?? "",
          name: session.user.name ?? null,
          image: session.user.image ?? null,
        },
      })
    } else {
      this.setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        profile: null,
      })
    }
  }

  clear(): void {
    this.state = DEFAULT_STATE
    this.setState({ isLoading: false })
  }

  setSyncing(syncing: boolean): void {
    this.setState({ isSyncing: syncing })
  }

  setLastSyncAt(date: Date): void {
    this.setState({ lastSyncAt: date })
  }

  getUser(): AccountUser | null {
    return this.state.user
  }

  getProfile(): AccountProfile | null {
    return this.state.profile
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated
  }
}

export const accountStore = new AccountStore()

export function useAccount(): AccountState {
  return useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot, () => DEFAULT_STATE)
}

export function useIsAuthenticated(): boolean {
  const state = useAccount()
  return state.isAuthenticated
}

export function useUser(): AccountUser | null {
  const state = useAccount()
  return state.user
}

export function useIsAdmin(): boolean {
  const state = useAccount()
  return state.profile?.isAdmin ?? false
}
