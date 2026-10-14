"use client";

import { FormEvent, useState } from "react";
import { createBrand } from "./actions";

export default function BrandForm() {
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");
        setSaving(true);

        try {
            const result = await createBrand(name);
            if (!result.ok) {
                setError(result.message);
                return;
            }
            setName("");
            setSuccess(result.message);
        } catch {
            // Unexpected exceptions are intentionally not reflected to the client.
            setError("Could not create the brand. Please check your access and try again.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold">Add brand</h2>
            <div className="flex gap-3">
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Samsung"
                    required
                    maxLength={100}
                    className="min-w-0 flex-1 rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                />
                <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                    {saving ? "Adding..." : "Add"}
                </button>
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
            {success ? <p role="status" className="mt-3 text-sm text-emerald-700">{success}</p> : null}
        </form>
    );
}
