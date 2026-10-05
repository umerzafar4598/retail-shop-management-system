export default function NoAccessPage() {
    return (
        <main className="flex min-h-screen items-center justify-center px-6">
            <div className="text-center">
                <h1 className="text-2xl font-semibold">
                    No Shop Access
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    Your account is authenticated but is not assigned to an active shop.
                </p>
            </div>
        </main>
    );
}