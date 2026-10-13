"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/authorization";

const ALLOWED_ROLES = ["Manager", "Cashier"] as const;

type StaffRole = (typeof ALLOWED_ROLES)[number];

type CreateStaffInput = {
    name: string;
    email: string;
    password: string;
    roleName: StaffRole;
};

async function getAuthenticatedUserId() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        throw new Error("You must be authenticated.");
    }

    return session.user.id;
}

export async function createStaff(input: CreateStaffInput) {
    const context = await requirePermission("user.create");
    const actorUserId = await getAuthenticatedUserId();

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();

    if (!name) {
        throw new Error("Name is required.");
    }

    if (!email) {
        throw new Error("Email is required.");
    }

    if (input.password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
    }

    if (!ALLOWED_ROLES.includes(input.roleName)) {
        throw new Error("Invalid staff role.");
    }

    const roleResult = await db.execute<{
        id: string;
    }>(
        sql`
      SELECT id
      FROM roles
      WHERE shop_id = ${context.shopId}
        AND name = ${input.roleName}
        AND is_system = true
      LIMIT 1
    `,
    );

    const role = roleResult.rows[0];

    if (!role) {
        throw new Error(
            `The ${input.roleName} role does not exist for this shop.`,
        );
    }

    const existingUserResult = await db.execute<{
        id: string;
    }>(
        sql`
      SELECT id
      FROM "user"
      WHERE lower(email) = ${email}
      LIMIT 1
    `,
    );

    let userId: string;
    let newlyCreatedUser = false;

    if (existingUserResult.rows[0]) {
        userId = existingUserResult.rows[0].id;

        if (userId === actorUserId) {
            throw new Error("You cannot add your own account as staff.");
        }

        const existingMembership = await db.execute<{
            id: string;
            status: string;
            roleId: string;
        }>(
            sql`
        SELECT id, status, role_id AS "roleId"
        FROM shop_memberships
        WHERE shop_id = ${context.shopId}
          AND user_id = ${userId}
        LIMIT 1
      `,
        );

        if (existingMembership.rows[0]?.status === "ACTIVE") {
            throw new Error(
                "This user is already an active member of this shop.",
            );
        }

        if (existingMembership.rows[0]) {
            const previous = existingMembership.rows[0];
            await db.transaction(async (tx) => {
                await tx.execute(
                    sql`
              UPDATE shop_memberships
              SET
                role_id = ${role.id},
                status = 'ACTIVE',
                updated_at = now()
              WHERE id = ${previous.id}
                AND shop_id = ${context.shopId}
            `,
                );
                await tx.insert(auditLogs).values({
                    shopId: context.shopId,
                    actorUserId,
                    action: "STAFF_MEMBERSHIP_REACTIVATED",
                    entityType: "SHOP_MEMBERSHIP",
                    entityId: previous.id,
                    metadata: {
                        userId,
                        email,
                        beforeStatus: previous.status,
                        afterStatus: "ACTIVE",
                        beforeRoleId: previous.roleId,
                        afterRoleId: role.id,
                        afterRoleName: input.roleName,
                    },
                });
            });

            revalidatePath("/settings/staff");

            return {
                success: true,
                message: "Existing user added to the shop successfully.",
            };
        }
    } else {
        const baseURL = process.env.BETTER_AUTH_URL;

        if (!baseURL) {
            throw new Error("BETTER_AUTH_URL is not configured.");
        }

        const response = await fetch(
            new URL("/api/auth/sign-up/email", baseURL),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Origin: baseURL,
                },
                body: JSON.stringify({
                    name,
                    email,
                    password: input.password,
                }),
                cache: "no-store",
            },
        );

        const body = (await response.json().catch(() => null)) as
            | {
                user?: {
                    id?: string;
                };
                message?: string;
                error?: {
                    message?: string;
                };
            }
            | null;

        if (!response.ok || !body?.user?.id) {
            throw new Error(
                body?.error?.message ??
                body?.message ??
                "Failed to create the authentication account.",
            );
        }

        userId = body.user.id;
        newlyCreatedUser = true;
    }

    try {
        await db.transaction(async (tx) => {
            const inserted = await tx.execute<{ id: string }>(
                sql`
          INSERT INTO shop_memberships (
            shop_id,
            user_id,
            role_id,
            status
          )
          VALUES (
            ${context.shopId},
            ${userId},
            ${role.id},
            'ACTIVE'
          )
          RETURNING id
        `,
            );
            const membership = inserted.rows[0];
            if (!membership) throw new Error("Failed to create shop membership.");
            await tx.insert(auditLogs).values({
                shopId: context.shopId,
                actorUserId,
                action: "STAFF_MEMBERSHIP_CREATED",
                entityType: "SHOP_MEMBERSHIP",
                entityId: membership.id,
                metadata: {
                    userId,
                    email,
                    roleId: role.id,
                    roleName: input.roleName,
                    status: "ACTIVE",
                    authenticationUserCreated: newlyCreatedUser,
                },
            });
        });
    } catch (error) {
        if (newlyCreatedUser) {
            await db.execute(
                sql`
          DELETE FROM "user"
          WHERE id = ${userId}
        `,
            );
        }

        throw error;
    }

    revalidatePath("/settings/staff");

    return {
        success: true,
        message: `${input.roleName} account created successfully.`,
    };
}

export async function setStaffStatus(
    userId: string,
    status: "ACTIVE" | "SUSPENDED",
) {
    const context = await requirePermission("user.suspend");
    const currentUserId = await getAuthenticatedUserId();
    if (status !== "ACTIVE" && status !== "SUSPENDED") {
        throw new Error("Invalid staff membership status.");
    }

    if (userId === currentUserId) {
        throw new Error(
            "You cannot change your own membership status.",
        );
    }

    await db.transaction(async (tx) => {
        const existing = await tx.execute<{ id: string; status: string; roleId: string }>(sql`
          SELECT id, status, role_id AS "roleId"
          FROM shop_memberships
          WHERE shop_id = ${context.shopId}
            AND user_id = ${userId}
          LIMIT 1
          FOR UPDATE
        `);
        const member = existing.rows[0];
        if (!member) throw new Error("Staff member was not found.");
        if (member.status === status) return;

        await tx.execute(sql`
          UPDATE shop_memberships
          SET status = ${status}, updated_at = now()
          WHERE shop_id = ${context.shopId}
            AND user_id = ${userId}
        `);
        await tx.insert(auditLogs).values({
            shopId: context.shopId,
            actorUserId: currentUserId,
            action: status === "SUSPENDED" ? "STAFF_MEMBER_SUSPENDED" : "STAFF_MEMBER_REACTIVATED",
            entityType: "SHOP_MEMBERSHIP",
            entityId: member.id,
            metadata: {
                userId,
                roleId: member.roleId,
                beforeStatus: member.status,
                afterStatus: status,
            },
        });
    });

    revalidatePath("/settings/staff");
}