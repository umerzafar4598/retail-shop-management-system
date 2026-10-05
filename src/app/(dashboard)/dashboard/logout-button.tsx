"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export default function LogoutButton() {
    const router = useRouter();

    async function handleLogout() {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    router.push("/login");
                    router.refresh();
                },
            },
        });
    }

    return (
        <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-slate-100"
        >
            Sign out
        </button>
    );
}