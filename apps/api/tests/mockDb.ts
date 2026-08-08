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
    commission_ledger: [] as any[],
    tasks: [] as any[],
    permissions: [
      { code: 'clients:read', family: 'client', label: 'View', owner_only: false },
      { code: 'financials:view', family: 'finance', label: 'Owner', owner_only: true }
    ] as any[],
    roles: [] as any[],
    user_roles: [] as any[],
    interaction_points: [
      { code: 'website_lead_form', points: 10 },
      { code: 'consultation_booked', points: 30 }
    ] as any[],
    scoring_events: [] as any[],
    segments: [] as any[],
    incentive_rules: [] as any[],
    incentive_entries: [] as any[],
    payout_statements: [] as any[],
    business_profile: [] as any[],
    purchase_invoices: [] as any[],
    tds_records: [] as any[],
    tcs_records: [] as any[],
    rate_limit: [] as any[],
    nurture_touches: [] as any[],
    experiments: [] as any[],
    experiment_assignments: [] as any[],
    job_postings: [] as any[],
    attestation_chains: [] as any[],
    universities: [] as any[],
    conversations: [] as any[],
    erpnext_sync_log: [] as any[]
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
    // 1a. INSERT ... ON CONFLICT (Drizzle upsert) — increment count atomically for rate_limit
    if (sql.toUpperCase().startsWith('INSERT') && sql.toLowerCase().includes('on conflict')) {
      const parts = sql.split(/values/i);
      const conflictTarget = (sql.match(/on conflict\s*\(([^)]+)\)/i) || [])[1]?.replace(/\W/g, '');
      const setMatch = sql.match(/do update\s+set\s+([\w_]+)\s*=/i);
      const incrementCol = setMatch ? setMatch[1] : '';
      const doNothing = /do\s+nothing/i.test(sql);

      if (conflictTarget || doNothing) {
        const colsMatch = parts[0].match(/\(([^)]+)\)/);
        if (colsMatch) {
          const columns = colsMatch[1].split(',').map(c => c.trim());
          const conflictIdx = conflictTarget ? columns.indexOf(conflictTarget) : -1;
          if (conflictTarget && conflictIdx >= 0 && params[conflictIdx] !== undefined) {
            const existing = (this.tables as any)[tableName].find(
              (r: any) => String(r[conflictTarget]) === String(params[conflictIdx])
            );
            if (existing) {
              if (doNothing) return { success: true, results: [] };
              if (incrementCol) {
                const camelKey = incrementCol.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                const cur = Number(existing[incrementCol] ?? existing[camelKey]) || 0;
                existing[incrementCol] = cur + 1;
                existing[camelKey] = cur + 1;
                return { success: true, results: [existing] };
              }
            }
          }
          // DO NOTHING without resolvable target → dedupe by full value equality
          if (doNothing) {
            const row: Record<string, any> = {};
            columns.forEach((col, i) => { row[col] = params[i]; });
            const dup = (this.tables as any)[tableName].find((r: any) =>
              columns.every((c) => String(r[c]) === String(row[c]))
            );
            if (dup) return { success: true, results: [] };
          }
        }
      }
    }

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
      const tableList = (this.tables as any)[tableName];
      if (tableList) {
        // Match rows by WHERE column equality (params correspond to SET terms then WHERE terms)
        const setClauseMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
        const whereMatches = [...(sql.match(/WHERE\s+([\w_]+)\s*=\s*\?/i) || [])];
        const whereCol = whereMatches.length ? whereMatches[1] : null;
        let row = null;
        if (setClauseMatch && whereCol) {
          const setTermCount = setClauseMatch[1].split(',').length;
          const whereVal = params[setTermCount]; // value after all SET params
          row = tableList.find((r: any) => {
            const camelKey = whereCol.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            const snakeKey = whereCol.replace(/([A-Z])/g, "_$1").toLowerCase();
            const val = r[whereCol] ?? r[camelKey] ?? r[snakeKey];
            return val !== undefined && String(val) === String(whereVal);
          });
        } else {
          // legacy fallback: match on last param vs id|client_id
          const idParam = params[params.length - 1];
          row = tableList.find((r: any) => r.id === idParam || r.client_id === idParam);
        }
        if (row && setClauseMatch) {
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
      return { success: true, results: [] };
    }

    // 3. SELECT
    if (sql.toUpperCase().startsWith('SELECT')) {
      let results = [...(this.tables as any)[tableName] || []];

      if (sql.toLowerCase().includes('where')) {
        const whereIndex = sql.toLowerCase().indexOf('where');
        const whereClause = sql.substring(whereIndex + 5);
        const eqMatches = [...whereClause.matchAll(/([\w_]+)\s*=\s*\?/g)];
        const lteMatches = [...whereClause.matchAll(/([\w_]+)\s*<=\s*\?/g)];
        if (eqMatches.length > 0 || lteMatches.length > 0) {
          results = results.filter(row => {
            const rowKey = (key: string) => {
              const k = [key, key.replace(/_([a-z])/g, (g) => g[1].toUpperCase()), key.replace(/([A-Z])/g, "_$1").toLowerCase()];
              return k.map(x => row[x]).find(v => v !== undefined);
            };

            // Equality conditions consume params[0..eqMatches.length)
            const eqOk = eqMatches.every((m, idx) => {
              const val = params[idx];
              const rowVal = rowKey(m[1]);
              return rowVal !== undefined && String(rowVal) === String(val);
            });

            // lte conditions consume params[eqMatches.length + i]
            const lteOk = lteMatches.every((m, i) => {
              const val = params[eqMatches.length + i];
              const rowVal = rowKey(m[1]);
              if (rowVal === undefined) return true;
              return Number(rowVal) <= Number(val);
            });

            return eqOk && lteOk;
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
