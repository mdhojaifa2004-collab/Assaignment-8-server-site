
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8000;

// ========================================
// MIDDLEWARE
// ========================================

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
  })
);

app.use(express.json());

// ========================================
// MONGODB CONNECTION
// ========================================

if (!process.env.MONGO_DB_SERVER) {
  console.error("❌ MONGO_DB_SERVER is missing in .env");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGO_DB_SERVER);

try {
  await client.connect();

  console.log("✅ You successfully connected to MongoDB!");
} catch (error) {
  console.error("❌ MongoDB connection failed:", error);
  process.exit(1);
}

const db = client.db("studiospace");

const singerCollection = db.collection("singer");
const myBookingsCollection = db.collection("my-bookings");

const BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL || "http://localhost:3000";

// ========================================
// BETTER AUTH SESSION MIDDLEWARE
// ========================================

async function requireAuth(req, res, next) {
  try {
    const cookie = req.headers.cookie;

    if (!cookie) {
      console.log("❌ Booking request blocked: No session cookie");

      return res.status(401).json({
        message: "Please login first",
      });
    }

    console.log("🔐 Verifying Better Auth session...");

    const response = await fetch(
      `${BETTER_AUTH_URL}/api/auth/get-session`,
      {
        method: "GET",
        headers: {
          cookie,
        },
      }
    );

    if (!response.ok) {
      console.log(
        "❌ Better Auth session verification failed:",
        response.status
      );

      return res.status(401).json({
        message: "Invalid session. Please login again.",
      });
    }

    const sessionData = await response.json();

    if (!sessionData?.user?.id) {
      console.log("❌ User is not authenticated");

      return res.status(401).json({
        message: "Please login first",
      });
    }

    req.user = sessionData.user;

    console.log("✅ Authenticated user:", req.user.email);

    next();
  } catch (error) {
    console.error("❌ Authentication error:", error);

    return res.status(500).json({
      message: "Authentication failed",
    });
  }
}

// ========================================
// SINGER FORM API
// ========================================


// thik kore daw console log rekho