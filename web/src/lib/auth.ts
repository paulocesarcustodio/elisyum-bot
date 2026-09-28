import {betterAuth} from 'better-auth'
import {admin} from 'better-auth/plugins/admin'
import {nextCookies} from 'better-auth/next-js'
import {drizzleAdapter} from 'better-auth/adapters/drizzle'
import {db} from '@/db'
import {user,session,account,verification} from '@/db/schema'
const baseURL=process.env.BETTER_AUTH_URL || 'http://localhost:3000'
export const auth=betterAuth({
    baseURL,
    secret:process.env.BETTER_AUTH_SECRET,
    database:drizzleAdapter(db,{provider:'pg',schema:{user,session,account,verification}}),
    plugins:[admin(),nextCookies()],
    emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:10},
    advanced:{useSecureCookies:baseURL.startsWith('https:')},
    trustedOrigins:[baseURL],
})
