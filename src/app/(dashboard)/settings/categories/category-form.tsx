"use client";

import { FormEvent, useState } from "react";

import { createCategory } from "./actions";

type Props = {
    categories: Array<{
        id: string;
        name: string;
    }>;
};

export default function CategoryForm({
    categories,
}: Props) {
    const [name, setName] = useState("");
    const [parentId, setParentId] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");
        setSaving(true);

        try {
            await createCategory({
                name,
                parentId: parentId || null,
            });

            setName("");
            setParentId("");
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to create category.",
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
            <h2 className="mb-4 font-semibold">
                Add category
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Chargers"
                    required
                    className="rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                />

                <select
                    value={parentId}
                    onChange={(event) => setParentId(event.target.value)}
                    className="rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                >
                    <option value="">
                        No parent category
                    </option>

                    {categories.map((category) => (
                        <option
                            key={category.id}
                            value={category.id}
                        >
                            {category.name}
                        </option>
                    ))}
                </select>
            </div>

            <button
                type="submit"
                disabled={saving}
                className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
                {saving ? "Adding..." : "Add category"}
            </button>

            {error && (
                <p className="mt-3 text-sm text-red-600">
                    {error}
                </p>
            )}
        </form>
    );
}