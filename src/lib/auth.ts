import "dotenv/config";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db/client";
import * as schema from "@/db/schema";

const baseURL = process.env.BETTER_AUTH_URL;

if (!baseURL) {
    throw new Error("BETTER_AUTH_URL is not configured.");
}

if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is not configured.");
}

export const auth = betterAuth({
    appName: "Hamid Mobiles and Communications",

    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),

    emailAndPassword: {
        enabled: true,
    },

    baseURL,

    trustedOrigins: [baseURL],

    secret: process.env.BETTER_AUTH_SECRET,

    plugins: [nextCookies()],
});