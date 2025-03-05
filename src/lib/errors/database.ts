// File: src/lib/errors/database.ts
import { NextResponse } from 'next/server';

export class DatabaseError extends Error {
  code?: string;
  errno?: number;
  status: number;

  constructor(message: string, status = 500, details?: Record<string, any>) {
    super(message);
    this.name = 'DatabaseError';
    this.status = status;
    Object.assign(this, details);
  }

  static fromError(error: unknown): DatabaseError {
    if (error instanceof DatabaseError) {
      return error;
    }

    if (error instanceof Error) {
      return new DatabaseError(error.message);
    }

    return new DatabaseError('Unknown database error');
  }

  toResponse() {
    return NextResponse.json(
      {
        error: this.message,
        details: process.env.NODE_ENV === 'development' ? this : undefined
      },
      { status: this.status }
    );
  }
}