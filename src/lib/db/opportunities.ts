// File: src/lib/db/opportunities.ts
import { query, QueryResultRow } from './index';
import { DatabaseError } from '../errors/database';

export interface Opportunity extends QueryResultRow {
  id: string;
  opportunity_id: string;
  product_id: string;
  employer: string;
  opportunity_owner: string;
  financial_analyst: string;
  strategic_pharmacy_analyst: string;
  stage_name: string;
  opportunity_metadata: any;
  created_by: string;
  created_at: Date;
  updated_by?: string;
  updated_at?: Date;
}

export async function getOpportunities(): Promise<Opportunity[]> {
  try {
    const result = await query<Opportunity>(
      'SELECT * FROM opportunity ORDER BY created_at DESC'
    );
    return result.rows;
  } catch (error) {
    throw DatabaseError.fromError(error);
  }
}

export async function getOpportunityById(opportunityId: string): Promise<Opportunity | null> {
  try {
    if (!opportunityId) {
      throw new DatabaseError('Opportunity ID is required', 400);
    }

    const result = await query<Opportunity>(
      'SELECT * FROM opportunity WHERE opportunity_id = $1',
      [opportunityId]
    );

    if (result.rows.length === 0) {
      throw new DatabaseError('Opportunity not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw DatabaseError.fromError(error);
  }
}

export async function createOpportunity(
  data: Omit<Opportunity, 'id' | 'created_at' | 'updated_at'>
): Promise<Opportunity> {
  try {
    const result = await query<Opportunity>(
      `INSERT INTO opportunity (
        opportunity_id,
        product_id,
        employer,
        opportunity_owner,
        financial_analyst,
        strategic_pharmacy_analyst,
        stage_name,
        opportunity_metadata,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.opportunity_id,
        data.product_id,
        data.employer,
        data.opportunity_owner,
        data.financial_analyst,
        data.strategic_pharmacy_analyst,
        data.stage_name,
        data.opportunity_metadata,
        data.created_by
      ]
    );
    return result.rows[0];
  } catch (error) {
    throw DatabaseError.fromError(error);
  }
}

export async function updateOpportunity(
  opportunityId: string,
  data: Partial<Omit<Opportunity, 'id' | 'created_at' | 'updated_at'>>
): Promise<Opportunity> {
  try {
    if (!opportunityId) {
      throw new DatabaseError('Opportunity ID is required', 400);
    }

    const setClause = Object.keys(data)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = [opportunityId, ...Object.values(data)];

    const result = await query<Opportunity>(
      `UPDATE opportunity 
       SET ${setClause}, updated_at = NOW() 
       WHERE opportunity_id = $1 
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new DatabaseError('Opportunity not found', 404);
    }

    return result.rows[0];
  } catch (error) {
    throw DatabaseError.fromError(error);
  }
}

export async function deleteOpportunity(opportunityId: string): Promise<void> {
  try {
    if (!opportunityId) {
      throw new DatabaseError('Opportunity ID is required', 400);
    }

    const result = await query<Opportunity>(
      'DELETE FROM opportunity WHERE opportunity_id = $1 RETURNING *',
      [opportunityId]
    );

    if (result.rows.length === 0) {
      throw new DatabaseError('Opportunity not found', 404);
    }
  } catch (error) {
    throw DatabaseError.fromError(error);
  }
}