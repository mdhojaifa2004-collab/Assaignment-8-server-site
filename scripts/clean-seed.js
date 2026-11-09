import { MongoClient } from "mongodb";
import "dotenv/config";

// Removes only documents created by scripts/seed.js (they all have a seedKey).
// Run with: npm run seed:clean

const mongoUri = process.env.MONGO_DB_SERVER || process.env.MONGODB_URI;
const dbName = process.env.MONGO_DB_NAME || "studiospace";

if (!mongoUri) {
  console.error("❌ MONGO_DB_SERVER (or MONGODB_URI) is missing in .env");
  process.exit(1);
}

const client = new MongoClient(mongoUri);

try {
  await client.connect();
  const db = client.db(dbName);

  const studios = await db
    .collection("studios")
    .deleteMany({ seedKey: { $regex: /^seed-/ } });
  const bookings = await db
    .collection("bookings")
    .deleteMany({ seedKey: { $regex: /^seed-/ } });

  console.log(`✅ Removed ${studios.deletedCount} seeded studio(s).`);
  console.log(`✅ Removed ${bookings.deletedCount} seeded booking(s).`);
} catch (error) {
  console.error("❌ Cleanup failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
