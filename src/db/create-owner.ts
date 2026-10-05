import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { auth } from "../lib/auth";
import { pool } from "./client";

async function main() {
    const rl = createInterface({
        input,
        output,
    });

    try {
        const name = (await rl.question("Owner name: ")).trim();
        const email = (await rl.question("Owner email: ")).trim();
        const password = await rl.question("Owner password: ");

        if (!name || !email || !password) {
            throw new Error("Name, email, and password are required.");
        }

        if (password.length < 8) {
            throw new Error("Password must be at least 8 characters.");
        }

        const result = await auth.api.signUpEmail({
            body: {
                name,
                email,
                password,
            },
        });

        console.log("\nOwner account created successfully.");
        console.log("User ID:", result.user.id);
        console.log("Email:", result.user.email);
    } catch (error) {
        console.error("\nFailed to create owner account.");

        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(error);
        }

        process.exitCode = 1;
    } finally {
        rl.close();
        await pool.end();
    }
}

main();