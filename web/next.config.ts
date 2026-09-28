import type {NextConfig} from 'next'
import path from 'node:path'
const nextConfig:NextConfig={
    outputFileTracingRoot:path.resolve(process.cwd(),'..'),
    serverExternalPackages:['better-auth','drizzle-orm','pg','pg-boss'],
    experimental:{externalDir:true},
    webpack(config){
        config.resolve.extensionAlias={'.js':['.ts','.tsx','.js'],'.mjs':['.mts','.mjs']}
        return config
    },
}
export default nextConfig
