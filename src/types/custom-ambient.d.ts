// Minimal ambient declarations to silence missing @types warnings during build
declare module 'fluent-ffmpeg' {
  const ffmpeg: any
  export default ffmpeg
}

declare module 'qrcode-terminal' {
  const qrcode: any
  export default qrcode
}

declare module 'fs-extra' {
  const fs: any
  export default fs
}

declare module 'jsdom' {
  export const JSDOM: any
}

declare module 'user-agents' {
  const UserAgent: any
  export default UserAgent
}

declare module 'adm-zip' {
  const AdmZip: any
  export default AdmZip
}

declare module 'qrcode-terminal' {
  const qrcode: any
  export default qrcode
}

declare module 'yt-search' {
  const yts: any
  export default yts
}

// other libraries used without types
declare module 'node-upload-images' { const m:any; export default m }
declare module 'node-webpmux' { const m:any; export default m }

type Base64URLString = string
