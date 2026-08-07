export class MockD1Database {
  public tables = {
    users: [] as any[],
    clients: [] as any[],
    pipeline_stages: [] as any[],
    engagements: [] as any[],
    documents: [] as any[],
    consents: [] as any[],
    communications: [] as any[],
    audit_log: [] as any[],
    sessions: [] as any[],
    accounts: [] as any[],
    verifications: [] as any[],
    clause_library: [] as any[],
    agreement_templates: [] as any[],
    agreements: [] as any[],
    payments: [] as any[],
    milestones: [] as any[],
    group_departures: [] as any[],
    seat_bookings: [] as any[],
    transit_shipments: [] as any[],
    partners: [] as any[],
    referrals: [] as any[],
    commission_ledger: [] as any[]
  };

  private getTableName(sql: string): string {
    const match = sql.match(/(?:from|into|update)\s+(\w+)/i);
    return match ? match[1] : '';
  }

  public prepare(sql: string) {
    // Strip double quotes, backticks, and any table name prefixes (e.g. "engagements"."id" -> id)
    const cleanSql = sql.replace(/[`"]/g, '').replace(/\b\w+\./g, '');
    const tableName = this.getTableName(cleanSql);
    
    return {
      bind: (...args: any[]) => {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const self = this;
        return {
          run: async () => self.execute(cleanSql, tableName, params),
          all: async () => self.execute(cleanSql, tableName, params),
          get: async () => {
            const res = await self.execute(cleanSql, tableName, params);
            return res.results && res.results.length > 0 ? res.results[0] : null;
          },
          raw: async () => {
            const res = await self.execute(cleanSql, tableName, params);
            return res.results.map(row => Object.values(row));
          },
          first: async () => {
            const res = await self.execute(cleanSql, tableName, params);
            return res.results && res.results.length > 0 ? res.results[0] : null;
          }
        };
      },
      run: async () => this.execute(cleanSql, tableName, []),
      all: async () => this.execute(cleanSql, tableName, []),
      get: async () => {
        const res = await this.execute(cleanSql, tableName, []);
        return res.results && res.results.length > 0 ? res.results[0] : null;
      },
      raw: async () => {
        const res = await this.execute(cleanSql, tableName, []);
        return res.results.map(row => Object.values(row));
      },
      first: async () => {
        const res = await this.execute(cleanSql, tableName, []);
        return res.results && res.results.length > 0 ? res.results[0] : null;
      }
    };
  }

  private async execute(sql: string, tableName: string, params: any[]) {
    // 1. INSERT INTO
    if (sql.toUpperCase().startsWith('INSERT')) {
      const parts = sql.split(/values/i);
      if (parts.length < 2) return { success: true, results: [] };
      
      const colsMatch = parts[0].match(/\(([^)]+)\)/);
      const valsMatch = parts[1].match(/\(([^)]+)\)/);
      if (!colsMatch || !valsMatch) return { success: true, results: [] };
      
      const columns = colsMatch[1].split(',').map(c => c.trim());
      const valTokens = valsMatch[1].split(',').map(v => v.trim());
      
      const row: any = {};
      let paramIdx = 0;
      columns.forEach((col, idx) => {
        const token = valTokens[idx];
        if (!token) return;
        
        if (token === '?') {
          row[col] = params[paramIdx++];
        } else if (token.toLowerCase() === 'null') {
          row[col] = null;
        } else {
          row[col] = token.replace(/^['"]|['"]$/g, '');
        }
      });
      
      (this.tables as any)[tableName].push(row);
      return { success: true, results: [row] };
    }

    // 2. UPDATE
    if (sql.toUpperCase().startsWith('UPDATE')) {
      const idParam = params[params.length - 1];
      const tableList = (this.tables as any)[tableName];
      if (tableList) {
        const row = tableList.find((r: any) => r.id === idParam || r.client_id === idParam);
        if (row) {
          const setClauseMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
          if (setClauseMatch) {
            const setTerms = setClauseMatch[1].split(',').map(t => t.trim());
            setTerms.forEach((term, idx) => {
              const col = term.split('=')[0].trim();
              const val = params[idx];
              row[col] = val;
              const camelKey = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
              row[camelKey] = val;
            });
          }
        }
      }
      return { success: true, results: [] };
    }

    // 3. SELECT
    if (sql.toUpperCase().startsWith('SELECT')) {
      let results = [...(this.tables as any)[tableName] || []];

      if (sql.toLowerCase().includes('where')) {
        const whereIndex = sql.toLowerCase().indexOf('where');
        const whereClause = sql.substring(whereIndex + 5);
        const matches = [...whereClause.matchAll(/([\w_]+)\s*=\s*\?/g)];
        if (matches.length > 0) {
          results = results.filter(row => {
            return matches.every((m, idx) => {
              const colName = m[1];
              const val = params[idx];
              
              const checkMatch = (key: string) => {
                const rowVal = row[key];
                if (rowVal === undefined) return false;
                return String(rowVal) === String(val);
              };

              const camelColName = colName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
              const snakeColName = colName.replace(/([A-Z])/g, "_$1").toLowerCase();

              return checkMatch(colName) || checkMatch(camelColName) || checkMatch(snakeColName);
            });
          });
        }
      }

      // Handle JOIN
      if (sql.includes('JOIN')) {
        results = this.tables.engagements
          .filter(e => e.status === 'active')
          .map(e => {
            const client = this.tables.clients.find(c => c.id === e.client_id);
            return {
              engagements: e,
              clients: client || null
            };
          });
      }

      // Filter columns based on SELECT clause to prevent index mismatch mapping in Drizzle .raw() execution
      const fromIndex = sql.toLowerCase().indexOf('from');
      const selectClause = sql.substring(7, fromIndex).trim();
      
      if (selectClause !== '*' && !selectClause.includes('count(*)') && !sql.includes('JOIN')) {
        const selectedCols = selectClause.split(',').map(c => {
          const parts = c.trim().split(/\s+/);
          const colName = parts[parts.length - 1]; // Handles aliases
          return colName.replace(/[`"]/g, '').replace(/\b\w+\./g, '');
        });

        results = results.map(row => {
          const filteredRow: any = {};
          selectedCols.forEach(col => {
            const camelKey = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            const snakeKey = col.replace(/([A-Z])/g, "_$1").toLowerCase();
            
            if (row[col] !== undefined) filteredRow[col] = row[col];
            else if (row[camelKey] !== undefined) filteredRow[col] = row[camelKey];
            else if (row[snakeKey] !== undefined) filteredRow[col] = row[snakeKey];
            else filteredRow[col] = null;
          });
          return filteredRow;
        });
      }

      return { success: true, results };
    }

    return { success: true, results: [] };
  }

  public async batch(statements: any[]) {
    return Promise.all(statements.map(s => s.run()));
  }

  public async exec(sql: string) {
    return { success: true };
  }
}
