import "server-only";

import { and, desc, ilike, or, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, user } from "@/db/schema";
import { requirePermission } from "@/lib/authorization";

export type AuditHistoryFilters = {
  query?: string;
  action?: string;
  entityType?: string;
};

function normalizeFilter(value: string | undefined, maxLength = 100) {
  return (value ?? "").trim().slice(0, maxLength);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listAuditHistory(filters: AuditHistoryFilters = {}) {
  const context = await requirePermission("audit.view");
  const query = normalizeFilter(filters.query);
  const action = normalizeFilter(filters.action, 80);
  const entityType = normalizeFilter(filters.entityType, 80);
  const conditions = [eq(auditLogs.shopId, context.shopId)];

  if (action) {
    conditions.push(ilike(auditLogs.action, `%${escapeLike(action)}%`));
  }

  if (entityType) {
    conditions.push(ilike(auditLogs.entityType, `%${escapeLike(entityType)}%`));
  }

  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(or(
      ilike(auditLogs.action, pattern),
      ilike(auditLogs.entityType, pattern),
      sql`${auditLogs.entityId}::text ILIKE ${pattern}`,
      ilike(user.name, pattern),
      ilike(user.email, pattern),
      sql`COALESCE(${auditLogs.metadata}::text, '') ILIKE ${pattern}`,
    )!);
  }

  const entries = await db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      actorName: user.name,
      actorEmail: user.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(user, eq(auditLogs.actorUserId, user.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(100);

  return {
    shopName: context.shopName,
    filters: { query, action, entityType },
    entries,
    limit: 100,
  };
}
