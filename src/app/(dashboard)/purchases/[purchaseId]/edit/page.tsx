import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/authorization";
import {
    getPurchaseDraftForEdit,
    getPurchaseDraftOptions,
} from "@/lib/purchases/purchase-drafts";
import PurchaseDraftForm from "../../purchase-draft-form";

function getPakistanToday(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Karachi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const part = (type: string) =>
        parts.find((item) => item.type === type)?.value ?? "";

    return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function EditPurchaseDraftPage({
    params,
}: {
    params: Promise<{ purchaseId: string }>;
}) {
    const { purchaseId } = await params;
    const shop = await requirePermission("products.update");
    const draft = await getPurchaseDraftForEdit(shop.shopId, purchaseId);

    if (!draft) notFound();

    const options = await getPurchaseDraftOptions(shop.shopId, {
        supplierId: draft.supplierId,
        variantIds: draft.lines.map((line) => line.variantId),
    });

    return (
        <main className="space-y-6 p-4 md:p-6">
            <header className="space-y-2">
                <Link
                    href={`/purchases/${draft.id}`}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    ← Back to {draft.documentNo}
                </Link>
                <p className="text-sm text-muted-foreground">Purchasing / Draft</p>
                <h1 className="text-2xl font-semibold tracking-tight">
                    Edit {draft.documentNo}
                </h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                    Only draft purchases can be edited. Saving updates the draft and
                    its audit history; stock, payments, and ledger balances remain unchanged.
                </p>
            </header>

            <PurchaseDraftForm
                suppliers={options.suppliers}
                variants={options.variants}
                today={getPakistanToday()}
                purchase={{
                    id: draft.id,
                    documentNo: draft.documentNo,
                    supplierId: draft.supplierId,
                    purchaseDate: draft.purchaseDate,
                    discountAmount: draft.discountAmount,
                    notes: draft.notes,
                    lines: draft.lines.map((line) => ({
                        variantId: line.variantId,
                        quantity: line.quantity,
                        unitCost: line.unitCost,
                    })),
                }}
            />
        </main>
    );
}
