import "dotenv/config"
import { betterAuth } from "better-auth";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/index"
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    database: drizzleAdapter(db, {
        provider: "pg",
    }),

    plugins: [nextCookies()],
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.BETTER_AUTH_URL!,
    trustedOrigins: [process.env.BETTER_AUTH_URL!],
});