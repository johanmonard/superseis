declare module "sql.js" {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  type BindParams = ReadonlyArray<string | number | Uint8Array | null>;

  interface Database {
    exec(sql: string): QueryExecResult[];
    run(sql: string, params?: BindParams): Database;
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsConfig {
    locateFile?: (filename: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
  export type { Database, QueryExecResult, SqlJsStatic };
}
