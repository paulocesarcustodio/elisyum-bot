declare module 'node-webpmux';
declare module 'pretty-num';
declare module 'node-gtts';
declare module '@vreden/youtube_scraper';
declare module 'emoji-mixer';

// Bun SQLite types
declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean });
    query<T = any>(sql: string): {
      get(...params: any[]): T | undefined;
      all(...params: any[]): T[];
      run(...params: any[]): void;
    };
    prepare<T = any>(sql: string): {
      get(...params: any[]): T | undefined;
      all(...params: any[]): T[];
      run(...params: any[]): void;
    };
    run(sql: string, ...params: any[]): void;
    close(): void;
  }
}
