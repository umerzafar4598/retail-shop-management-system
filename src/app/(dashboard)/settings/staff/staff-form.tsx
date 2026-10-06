"use client";

import { FormEvent, useState } from "react";

import { createStaff } from "./actions";

export default function StaffForm() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [roleName, setRoleName] =
        useState<"Manager" | "Cashier">("Cashier");

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setMessage("");
        setError("");
        setSaving(true);

        try {
            const result = await createStaff({
                name,
                email,
                password,
                roleName,
            });

            setMessage(result.message);

            setName("");
            setEmail("");
            setPassword("");
            setRoleName("Cashier");
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to create staff member.",
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-2xl border bg-white p-6 shadow-sm"
        >
            <h2 className="mb-6 font-semibold">
                Add staff member
            </h2>

            <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                    <label
                        htmlFor="staff-name"
                        className="text-sm font-medium"
                    >
                        Full name
                    </label>

                    <input
                        id="staff-name"
                        value={name}
                        onChange={(event) =>
                            setName(event.target.value)
                        }
                        required
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                        placeholder="Ali Khan"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="staff-role"
                        className="text-sm font-medium"
                    >
                        Role
                    </label>

                    <select
                        id="staff-role"
                        value={roleName}
                        onChange={(event) =>
                            setRoleName(
                                event.target.value as "Manager" | "Cashier",
                            )
                        }
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                    >
                        <option value="Cashier">Cashier</option>
                        <option value="Manager">Manager</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="staff-email"
                        className="text-sm font-medium"
                    >
                        Email
                    </label>

                    <input
                        id="staff-email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.target.value)
                        }
                        required
                        autoComplete="off"
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                        placeholder="staff@example.com"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="staff-password"
                        className="text-sm font-medium"
                    >
                        Initial password
                    </label>

                    <input
                        id="staff-password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                            setPassword(event.target.value)
                        }
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                        placeholder="At least 8 characters"
                    />
                </div>
            </div>

            {message && (
                <div className="mt-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                    {message}
                </div>
            )}

            {error && (
                <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? "Creating..." : "Create staff"}
                </button>
            </div>
        </form>
    );
}