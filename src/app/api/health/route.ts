// File: src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { checkConnection } from '@/lib/db';

export async function GET() {
  try {
    const isConnected = await checkConnection();
    if (!isConnected) {
      return NextResponse.json({ status: 'error', message: 'Database connection failed' }, { status: 500 });
    }
    return NextResponse.json({ status: 'ok', message: 'Database connected' });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'Health check failed' }, { status: 500 });
  }
}