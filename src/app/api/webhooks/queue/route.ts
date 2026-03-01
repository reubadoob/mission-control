import { NextRequest, NextResponse } from 'next/server';
import { getWebhookQueueEntries, type WebhookQueueStatus } from '@/lib/webhook-queue';

const VALID_STATUSES: WebhookQueueStatus[] = ['pending', 'succeeded', 'failed', 'dead'];

export async function GET(request: NextRequest) {
  try {
    const statusParam = request.nextUrl.searchParams.get('status');
    const limitParam = Number(request.nextUrl.searchParams.get('limit') || 100);

    let status: WebhookQueueStatus | undefined;
    if (statusParam) {
      if (!VALID_STATUSES.includes(statusParam as WebhookQueueStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Expected one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 },
        );
      }
      status = statusParam as WebhookQueueStatus;
    }

    const jobs = getWebhookQueueEntries(status, limitParam);

    return NextResponse.json({
      count: jobs.length,
      status: status ?? 'all',
      jobs,
    });
  } catch (error) {
    console.error('Failed to fetch webhook queue status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhook queue status' },
      { status: 500 },
    );
  }
}
