import { sql } from "drizzle-orm";

import { db } from "@/db/client";

type DbExecutor = Pick<typeof db, "execute">;

export async function nextDocumentNumber(
    tx: DbExecutor,
    shopId: string,
    documentType: string,
    prefix: string,
    year: number,
) {
    if (!documentType.trim()) {
        throw new Error("Document type is required.");
    }

    if (!prefix.trim()) {
        throw new Error("Document prefix is required.");
    }

    if (!Number.isInteger(year) || year < 2000) {
        throw new Error("Document year is invalid.");
    }

    const result = await tx.execute<{
        lastValue: number;
    }>(sql`
    INSERT INTO document_sequences (
      shop_id,
      document_type,
      year,
      last_value
    )
    VALUES (
      ${shopId},
      ${documentType},
      ${year},
      1
    )
    ON CONFLICT (
      shop_id,
      document_type,
      year
    )
    DO UPDATE SET
      last_value =
        document_sequences.last_value + 1
    RETURNING last_value AS "lastValue"
  `);

    const lastValue = Number(
        result.rows[0]?.lastValue,
    );

    if (
        !Number.isInteger(lastValue) ||
        lastValue <= 0
    ) {
        throw new Error(
            "Failed to generate the next document number.",
        );
    }

    return `${prefix}-${year}-${lastValue
        .toString()
        .padStart(6, "0")}`;
}