export default function ForbiddenPage() {
    return (
        <main className="flex min-h-screen items-center justify-center px-6">
            <div className="text-center">
                <h1 className="text-2xl font-semibold">
                    Access Denied
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    You do not have permission to perform this action.
                </p>
            </div>
        </main>
    );
}