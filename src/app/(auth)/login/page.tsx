import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";
import LoginForm from "./login-form";

export default async function LoginPage() {
    const session = await getCurrentSession();

    if (session) {
        redirect("/dashboard");
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <LoginForm />
        </main>
    );
}