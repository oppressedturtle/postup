/**
 * GET /api/health
 *
 * Used by Docker HEALTHCHECK, uptime monitors, and load balancers.
 * Checks Postgres, Redis, and S3/MinIO independently — each failure is
 * isolated so the response always includes a full service map.
 *
 * Returns HTTP 200 when all services are healthy, 503 when any are degraded.
 * The JSON body is always present regardless of status code.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { s3 } from "@/lib/storage";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

type ServiceStatus = "ok" | "error";

interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    storage: ServiceStatus;
  };
  version: string;
}

/**
 * Run a promise with a timeout. Rejects after `ms` milliseconds so a
 * stalled dependency never hangs the health check indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function checkDatabase(): Promise<ServiceStatus> {
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, 3000);
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  try {
    const result = await withTimeout(redis.ping(), 2000);
    return result === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkStorage(): Promise<ServiceStatus> {
  try {
    await withTimeout(
      s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })),
      3000,
    );
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const [databaseStatus, redisStatus, storageStatus] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
  ]);

  const services: HealthResponse["services"] = {
    database: databaseStatus,
    redis: redisStatus,
    storage: storageStatus,
  };

  const allOk = Object.values(services).every((s) => s === "ok");

  const body: HealthResponse = {
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services,
    version: "0.1.0",
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
