import "server-only";

import { db } from "@/db/client";
import {
    getCurrentShopContext,
} from "@/lib/authorization";
import { getCurrentSession } from "@/lib/session";

import {
    postLedgerTransactionInTransaction,
    type LedgerPostingLine,
    type PostLedgerTransactionInput,
    type PostedLedgerTransaction,
} from "./ledger-core";

export type {
    LedgerPostingLine,
    PostLedgerTransactionInput,
    PostedLedgerTransaction,
};

export {
    postLedgerTransactionInTransaction,
} from "./ledger-core";

export async function postLedgerTransaction(
    input: PostLedgerTransactionInput,
): Promise<PostedLedgerTransaction> {
    const context = await getCurrentShopContext();

    if (!context) {
        throw new Error(
            "You must belong to an active shop.",
        );
    }

    const session = await getCurrentSession();

    if (!session) {
        throw new Error(
            "You must be authenticated.",
        );
    }

    return db.transaction(async (tx) => {
        return postLedgerTransactionInTransaction(
            tx,
            {
                shopId: context.shopId,
                userId: session.user.id,
            },
            input,
        );
    });
}