"use client";

import { FormEvent, useState } from "react";
import { createCategory } from "./actions";

type Props = {
    categories: Array<{ id: string; name: string }>;
};

export default function CategoryForm({ categories }: Props) {
    const [name, setName] = useState("");
    const [parentId, setParentId] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");
        setSaving(true);

        try {
            const result = await createCategory({ name, parentId: parentId || null });
            if (!result.ok) {
                setError(result.message);
                return;
            }
            setName("");
            setParentId("");
            setSuccess(result.message);
        } catch {
            setError("Could not create the category. Please check your access and try again.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold">Add category</h2>
            <div className="grid gap-3 md:grid-cols-2">
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Chargers"
                    required
                    maxLength={100}
                    className="rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                />
                <select value={parentId} onChange={(event) => setParentId(event.target.value)} className="rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900">
                    <option value="">No parent category</option>
                    {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                </select>
            </div>
            <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {saving ? "Adding..." : "Add category"}
            </button>
            {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
            {success ? <p role="status" className="mt-3 text-sm text-emerald-700">{success}</p> : null}
        </form>
    );
}
