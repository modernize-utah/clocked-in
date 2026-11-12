import type { PoolConfig } from "pg";

function postgresHost(connectionString: string) {
  return /^postgres(?:ql)?:\/\/(?:[^@/]+@)?([^:/?]+)/i.exec(connectionString)?.[1] ?? "";
}

/** Application traffic must use the Prisma pooler. The direct host is for migrations. */
export function applicationConnectionString(connectionString: string) {
  return connectionString.replace(
    /^(postgres(?:ql)?:\/\/[^@]+@)db\.prisma\.io(?=[:/])/i,
    "$1pooled.db.prisma.io",
  );
}

/** DATABASE_POOL_MAX overrides the pool size, for example 1 locally to reproduce production pressure. */
function poolMaxOverride() {
  const value = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function prismaPoolConfig(connectionString: string, options?: { pooled?: boolean }): PoolConfig {
  const pooled = options?.pooled !== false;
  const resolved = pooled ? applicationConnectionString(connectionString) : connectionString;
  const host = postgresHost(resolved);
  const max = poolMaxOverride();
  if (host !== "db.prisma.io" && host !== "pooled.db.prisma.io") {
    return max ? { connectionString: resolved, max } : { connectionString: resolved };
  }

  // A few connections per instance, so one slow request does not queue every other request behind it.
  // A request that still cannot get a connection fails instead of waiting forever.
  return {
    connectionString: resolved,
    max: max ?? 3,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  };
}
