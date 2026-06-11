/**
 * Structured logger for PostUp.
 *
 * - Development: human-readable output via pino-pretty (coloured, translated
 *   timestamps, formatted objects).
 * - Production: newline-delimited JSON — machine-parseable by log aggregators
 *   (Loki, Datadog, CloudWatch, etc.).
 *
 * All log records carry a `service` field so that multi-service log streams
 * can be filtered immediately.
 *
 * Usage:
 *   import logger from "@/lib/logger";
 *   logger.info("server started");
 *   logger.error({ err }, "request failed");
 *
 *   // Attach request-scoped context with a child logger:
 *   const reqLogger = logger.child({ requestId, userId });
 *   reqLogger.info("processing request");
 */
import pino from "pino";
import { env } from "./env";

const isDev = env.NODE_ENV === "development";

const logger = pino(
  {
    // Base bindings present on every log record.
    base: { service: "postup" },

    // Numeric timestamps (epoch ms) in prod; pino-pretty converts them in dev.
    timestamp: pino.stdTimeFunctions.isoTime,

    level: isDev ? "debug" : "info",

    // Serialise Error objects on the `err` key following pino convention.
    serializers: {
      err: pino.stdSerializers.err,
    },
  },
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      })
    : pino.destination(1), // stdout in prod
);

export default logger;
