import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  plugins: [admin(), nextCookies()],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {},
  advanced: {
    useSecureCookies: false,
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
    "http://192.168.0.118:3000",
    "https://bot.michiganvalinhos.com.br",
  ],
});
