declare module 'pg-format' {
    function format(query: string, ...values: any[]): string;
    export = format;
  }