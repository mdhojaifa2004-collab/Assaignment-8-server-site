
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


// import { MongoClient } from 'mongodb';

// import 'dotenv/config'
// import express from "express";
// import cors from  "cors"

// const app = express();
// const PORT = 8000;

// app.use(cors())
// app.use(express.json())

// const client = new MongoClient(process.env.MONGO_DB_SERVER);

// export async function connectToMongoDB() {
//   try {
//     await client.connect();
//     console.log("You successfully connected to MongoDB!");
//     return client;
//   } catch (err) {
//     console.dir(err);
//   }
// }

// const MongoClient = await connectToMongoDB();
// const db = MongoClient.db("srudiospace")
// const singerCollection = db.collection("singer")


// app.post('/singer-form',async (req,res) => {
//   const data = req.body
//   const result = await singerCollection.insertOne(data)
  
  
  
//   console.log(result)
//   res.send(result)
// })

// //http://localhost:8000/singer-form



// app.get("/", (req, res) => {
//   res.send("StudioSpace Server is Running!");
// });

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });



// thik kore daw console log rekho