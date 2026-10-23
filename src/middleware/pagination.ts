import sql from 'mssql';

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function parsePaginationQuery(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize };
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function countQuery(
  pool: sql.ConnectionPool,
  baseQuery: string,
  whereClause: string,
  inputs: Record<string, { type: sql.ISqlType; value: any }>
): Promise<number> {
  const request = pool.request();
  for (const [key, { type, value }] of Object.entries(inputs)) {
    request.input(key, type, value);
  }
  const countSql = `SELECT COUNT(*) AS total FROM (${baseQuery}) AS _count ${whereClause}`;
  const result = await request.query(countSql);
  return result.recordset[0]?.total || 0;
}

export function addPaginationToQuery(
  baseQuery: string,
  whereClause: string,
  orderClause: string,
  params: PaginationParams
): string {
  return `${baseQuery} ${whereClause} ${orderClause} OFFSET ${params.offset} ROWS FETCH NEXT ${params.limit} ROWS ONLY`;
}
