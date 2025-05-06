// lib/db.ts
import { PrismaClient } from "@prisma/client";

// Declare a global variable to hold the Prisma Client instance.
// This prevents creating multiple instances during hot-reloading in development.
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Instantiate PrismaClient. In development, reuse the existing instance
// attached to the global object if it exists. Otherwise, create a new instance.
// In production, always create a new instance.
export const prisma =
  global.prisma ||
  new PrismaClient({
    // Optional: Enable logging for debugging database queries
    // log: ['query', 'info', 'warn', 'error'],
  });

// If in development, assign the new instance to the global variable.
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Export the Prisma Client instance for use in other parts of your application.
export default prisma;
