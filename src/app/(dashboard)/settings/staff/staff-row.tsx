"use client";

import { useTransition } from "react";

import { setStaffStatus } from "./actions";

type Props = {
    member: {
        userId: string;
        name: string;
        email: string;
        roleName: string;
        status: "ACTIVE" | "INVITED" | "SUSPENDED";
    };
};

export default function StaffRow({ member }: Props) {
    const [isPending, startTransition] = useTransition();

    const isOwner = member.roleName === "Owner";
    const isActive = member.status === "ACTIVE";

    function changeStatus() {
        const nextStatus = isActive
            ? "SUSPENDED"
            : "ACTIVE";

        startTransition(async () => {
            await setStaffStatus(
                member.userId,
                nextStatus,
            );
        });
    }

    return (
        <div className="flex items-center justify-between gap-4 px-6 py-5">
            <div className="min-w-0">
                <p className="font-medium">
                    {member.name}
                </p>

                <p className="truncate text-sm text-slate-500">
                    {member.email}
                </p>

                <div className="mt-1 flex gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1">
                        {member.roleName}
                    </span>

                    <span
                        className={
                            member.status === "ACTIVE"
                                ? "rounded-full bg-green-50 px-2 py-1 text-green-700"
                                : "rounded-full bg-slate-100 px-2 py-1 text-slate-600"
                        }
                    >
                        {member.status}
                    </span>
                </div>
            </div>

            {!isOwner && (
                <button
                    type="button"
                    onClick={changeStatus}
                    disabled={isPending}
                    className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                    {isActive ? "Suspend" : "Reactivate"}
                </button>
            )}
        </div>
    );
}