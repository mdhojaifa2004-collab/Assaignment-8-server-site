
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

app.post("/singer-form", async (req, res) => {
  try {
    console.log("📩 Singer form received");

    const result = await singerCollection.insertOne(req.body);

    console.log("✅ Singer form saved:", result.insertedId);

    return res.status(201).json({
      success: true,
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("❌ Singer form error:", error);

    return res.status(500).json({
      message: "Failed to save singer form",
    });
  }
});

// ========================================
// CREATE BOOKING
// ========================================

app.post("/my-bookings", requireAuth, async (req, res) => {
  try {
    console.log("📩 New booking request received");

    const {
      studioId,
      studioName,
      category,
      location,
      date,
      time,
      hours,
      total,
      currency,
    } = req.body;

    const numericHours = Number(hours);
    const numericTotal = Number(total);

    if (
      !studioId ||
      !studioName ||
      !date ||
      !time ||
      !Number.isFinite(numericHours) ||
      numericHours < 1 ||
      !Number.isFinite(numericTotal) ||
      numericTotal < 0
    ) {
      console.log("❌ Invalid booking information");

      return res.status(400).json({
        message: "Invalid booking information",
      });
    }

    const bookingData = {
      studioId,
      studioName,
      category: category || "",
      location: location || "",
      date,
      time,
      hours: numericHours,
      total: numericTotal,
      currency: currency || "৳",

      userId: req.user.id,
      userEmail: req.user.email,

      createdAt: new Date().toISOString(),
    };

    const result = await myBookingsCollection.insertOne(bookingData);

    console.log("✅ Booking saved:", result.insertedId);
    console.log("👤 Booking user:", req.user.email);

    return res.status(201).json({
      success: true,
      message: "Booking saved successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("❌ Booking insert error:", error);

    return res.status(500).json({
      message: "Failed to add booking",
    });
  }
});

// ========================================
// GET BOOKINGS - LOGGED-IN USER ONLY
// ========================================

app.get("/my-bookings", requireAuth, async (req, res) => {
  try {
    console.log("📡 Fetching bookings for:", req.user.email);

    const bookings = await myBookingsCollection
      .find({
        userId: req.user.id,
      })
      .sort({ createdAt: -1 })
      .toArray();

    console.log("✅ Bookings fetched:", bookings.length);
    console.log("👤 Booking owner:", req.user.email);

    return res.status(200).json(bookings);
  } catch (error) {
    console.error("❌ Booking fetch error:", error);

    return res.status(500).json({
      message: "Failed to fetch bookings",
    });
  }
});

// ========================================
// UPDATE BOOKING - OWNER ONLY
// ========================================

app.put("/my-bookings/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, hours } = req.body;

    console.log("✏️ Booking update requested:", id);

    if (!ObjectId.isValid(id)) {
      console.log("❌ Invalid booking ID:", id);

      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }

    const numericHours = Number(hours);

    if (
      !date ||
      !time ||
      !Number.isFinite(numericHours) ||
      numericHours < 1
    ) {
      return res.status(400).json({
        message: "Invalid booking information",
      });
    }

    const booking = await myBookingsCollection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (!booking) {
      console.log("❌ Booking not found for user:", req.user.email);

      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const hourlyRate =
      Number(booking.total) / Number(booking.hours);

    const updatedTotal = hourlyRate * numericHours;

    const result = await myBookingsCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId: req.user.id,
      },
      {
        $set: {
          date,
          time,
          hours: numericHours,
          total: updatedTotal,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    console.log("✅ Booking updated:", id);
    console.log("👤 Updated by:", req.user.email);

    return res.status(200).json({
      success: true,
      message: "Booking updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Booking update error:", error);

    return res.status(500).json({
      message: "Failed to update booking",
    });
  }
});

// ========================================
// DELETE BOOKING - OWNER ONLY
// ========================================

app.delete("/my-bookings/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑️ Booking cancellation requested:", id);

    if (!ObjectId.isValid(id)) {
      console.log("❌ Invalid booking ID:", id);

      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }

    const result = await myBookingsCollection.deleteOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (result.deletedCount === 0) {
      console.log("❌ Booking not found:", id);

      return res.status(404).json({
        message: "Booking not found",
      });
    }

    console.log("✅ Booking cancelled:", id);
    console.log("👤 Cancelled by:", req.user.email);

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("❌ Booking delete error:", error);

    return res.status(500).json({
      message: "Failed to cancel booking",
    });
  }
});

// ========================================
// SERVER HEALTH CHECK
// ========================================

app.get("/", (req, res) => {
  console.log("📡 Server health check");

  res.status(200).send("StudioSpace Server is Running!");
});

// ========================================
// START SERVER
// ========================================




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