import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

import StaffForm from "./staff-form";
import StaffRow from "./staff-row";

type StaffMember = {
    userId: string;
    name: string;
    email: string;
    roleName: string;
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

export default async function StaffPage() {
    const context = await requirePermission("user.view");

    const result = await db.execute<StaffMember>(
        sql`
      SELECT
        u.id AS "userId",
        u.name,
        u.email,
        r.name AS "roleName",
        sm.status
      FROM shop_memberships sm
      INNER JOIN "user" u
        ON u.id = sm.user_id
      INNER JOIN roles r
        ON r.id = sm.role_id
       AND r.shop_id = sm.shop_id
      WHERE sm.shop_id = ${context.shopId}
      ORDER BY
        CASE r.name
          WHEN 'Owner' THEN 1
          WHEN 'Manager' THEN 2
          WHEN 'Cashier' THEN 3
          ELSE 4
        END,
        u.name ASC
    `,
    );

    return (
        <main className="mx-auto max-w-5xl px-6 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold">
                    Staff
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    Manage the users who have access to {context.shopName}.
                </p>
            </div>

            <div className="mb-8">
                <StaffForm />
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="border-b px-6 py-4">
                    <h2 className="font-semibold">
                        Shop members
                    </h2>
                </div>

                {result.rows.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-slate-500">
                        No staff members found.
                    </div>
                ) : (
                    <div className="divide-y">
                        {result.rows.map((member) => (
                            <StaffRow
                                key={member.userId}
                                member={member}
                            />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}