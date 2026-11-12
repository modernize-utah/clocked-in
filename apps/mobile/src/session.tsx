import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import type { Session, User } from "@/api/types";
import { deleteSecret, readSecret, writeSecret } from "@/storage";

const refreshKey = "voluntime.refreshToken";
const organizationKey = "voluntime.organizationId";

type Status = "loading" | "signedOut" | "password" | "ready";

type SessionValue = {
  status: Status;
  user: User | null;
  organizationId: string | null;
  login: (username: string, password: string) => Promise<void>;
  start: (session: Session) => Promise<void>;
  replaceUser: (user: User) => void;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, password: string) => Promise<void>;
  setOrganizationId: (organizationId: string) => Promise<void>;
  pendingPassword: string;
};

const SessionContext = createContext<SessionValue | null>(null);

async function persist(session: Session) {
  api.setSession(session);
  await writeSecret(refreshKey, session.refreshToken);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [organizationId, setOrganizationIdState] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState("");

  useEffect(() => {
    api.onSession = (session) => {
      void writeSecret(refreshKey, session.refreshToken);
      setUser(session.user);
    };
    let cancelled = false;
    (async () => {
      const [refreshToken, storedOrganizationId] = await Promise.all([readSecret(refreshKey), readSecret(organizationKey)]);
      if (!refreshToken) {
        if (!cancelled) setStatus("signedOut");
        return;
      }
      try {
        const session = await api.refresh(refreshToken);
        if (cancelled) return;
        await persist(session);
        setUser(session.user);
        setOrganizationIdState(storedOrganizationId);
        setStatus(session.user.mustChangePassword ? "password" : "ready");
      } catch {
        await deleteSecret(refreshKey);
        if (!cancelled) setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
      api.onSession = null;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      organizationId,
      pendingPassword,
      async login(username, password) {
        const session = await api.login(username.trim(), password);
        await persist(session);
        setUser(session.user);
        setPendingPassword(session.user.mustChangePassword ? password : "");
        setStatus(session.user.mustChangePassword ? "password" : "ready");
      },
      async start(session) {
        await persist(session);
        setUser(session.user);
        setPendingPassword("");
        setStatus(session.user.mustChangePassword ? "password" : "ready");
      },
      replaceUser(next) {
        setUser(next);
      },
      async logout() {
        try {
          if (api.refreshToken) await api.logout();
        } catch {
          // The local session is cleared even when the server already rejected the token.
        }
        api.setSession(null);
        await deleteSecret(refreshKey);
        setUser(null);
        setPendingPassword("");
        setStatus("signedOut");
      },
      async changePassword(currentPassword, password) {
        if (!user) throw new Error("Sign in before changing the password.");
        await api.patchMe({ password, currentPassword });
        const session = await api.login(user.username, password);
        await persist(session);
        setUser(session.user);
        setPendingPassword("");
        setStatus("ready");
      },
      async setOrganizationId(next) {
        setOrganizationIdState(next);
        await writeSecret(organizationKey, next);
      },
    }),
    [organizationId, pendingPassword, status, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
