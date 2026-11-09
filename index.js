import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

// ========================================
// CONFIG
// ========================================

const app = express();

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const PORT = parsePort(process.env.PORT) || 5000;

// The old StudioSpace frontend still calls port 8000. In development we can
// keep that working without touching either frontend. Set LEGACY_PORT=off to
// disable the second listener.
const legacyPortSetting = process.env.LEGACY_PORT;
const LEGACY_PORT =
  legacyPortSetting === "off" || legacyPortSetting === "false"
    ? null
    : parsePort(legacyPortSetting) ?? (IS_PRODUCTION ? null : 8000);

const MONGO_URI =
  process.env.MONGO_DB_SERVER || process.env.MONGODB_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "studiospace";

const BETTER_AUTH_URL = (
  process.env.BETTER_AUTH_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_COOKIE_NAME = "studiospace_token";
const JWT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];
const CONFIGURED_ORIGINS = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_ORIGINS,
  ...CONFIGURED_ORIGINS,
]);

const STUDIO_CATEGORIES = new Set([
  "Photo Studios",
  "Sound Stages",
  "Podcast Rooms",
  "Music Suites",
  "Art Workshops",
]);

if (!MONGO_URI) {
  console.error("❌ MONGO_DB_SERVER (or MONGODB_URI) is missing in .env");
  process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    "❌ JWT_SECRET is missing or too short. Add a random string of at least 32 characters to .env.",
  );
  process.exit(1);
}

// ========================================
// MIDDLEWARE
// ========================================

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header (curl, server-to-server) are allowed.
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS: origin is not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// API responses are always dynamic; never let a browser/CDN cache them.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// ========================================
// MONGODB CONNECTION
// ========================================

const client = new MongoClient(MONGO_URI);

try {
  await client.connect();
  await client.db(MONGO_DB_NAME).command({ ping: 1 });
  console.log("✅ You successfully connected to MongoDB!");
} catch (error) {
  console.error("❌ MongoDB connection failed:", error.message);
  process.exit(1);
}

const db = client.db(MONGO_DB_NAME);

const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");
const wishlistsCollection = db.collection("wishlists");
const reviewsCollection = db.collection("reviews");

// Legacy StudioSpace collections (kept for the old frontend).
const singerCollection = db.collection("singer");
const myBookingsCollection = db.collection("my-bookings");

async function createIndexes() {
  const results = await Promise.allSettled([
    studiosCollection.createIndex({ category: 1 }),
    studiosCollection.createIndex({ ownerEmail: 1 }),
    studiosCollection.createIndex({ rating: -1 }),
    studiosCollection.createIndex({ createdAt: -1 }),
    bookingsCollection.createIndex({ userId: 1, createdAt: -1 }),
    bookingsCollection.createIndex({ ownerEmail: 1, status: 1 }),
    bookingsCollection.createIndex({ studioId: 1, date: 1, status: 1 }),
    wishlistsCollection.createIndex(
      { userId: 1, studioId: 1 },
      { unique: true },
    ),
    myBookingsCollection.createIndex({ userId: 1, createdAt: -1 }),
  ]);

  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    console.warn(
      `⚠️ ${failed.length} database index(es) could not be created. Existing duplicate data may be the cause.`,
    );
  }
}

await createIndexes();

// ========================================
// SMALL VALIDATION HELPERS
// ========================================

function isNonEmptyString(value, maxLength = 5000) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isHttpUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toObjectId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    return null;
  }
  return new ObjectId(value);
}

function sameEmail(first, second) {
  return (
    typeof first === "string" &&
    typeof second === "string" &&
    first.toLowerCase() === second.toLowerCase()
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getQueryString(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function serverError(res, logLabel, error, message = "Internal server error") {
  console.error(`❌ ${logLabel}:`, error?.message || error);
  return res.status(500).json({ message });
}

// ========================================
// BETTER AUTH / JWT
// ========================================

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
    maxAge: JWT_MAX_AGE_MS,
  };
}

function clearAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
  };
}

async function getBetterAuthSession(cookieHeader) {
  if (!cookieHeader) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${BETTER_AUTH_URL}/api/auth/get-session`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
          accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const user = data?.user;

    if (!user?.id || !user?.email) return null;

    return {
      id: String(user.id),
      name: typeof user.name === "string" ? user.name : "",
      email: String(user.email),
      image: user.image ?? null,
    };
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(
        "❌ Better Auth session check failed:",
        error?.message || error,
      );
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readJwtUser(req) {
  const token = req.cookies?.[JWT_COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      payload.userId.length === 0 ||
      payload.email.length === 0
    ) {
      return null;
    }

    return {
      id: payload.userId,
      name: typeof payload.name === "string" ? payload.name : "",
      email: payload.email,
      image: payload.image ?? null,
    };
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  try {
    const jwtUser = readJwtUser(req);
    if (jwtUser) {
      req.user = jwtUser;
      return next();
    }

    // Fallback for requests made before the JWT cookie is issued (or after a
    // JWT_SECRET change). This also keeps the old frontend working.
    const sessionUser = await getBetterAuthSession(req.headers.cookie);
    if (!sessionUser) {
      return res.status(401).json({ message: "Please login first" });
    }

    req.user = sessionUser;
    return next();
  } catch (error) {
    return serverError(res, "Authentication error", error, "Authentication failed");
  }
}

// Exchange a valid BetterAuth session for our own HTTPOnly JWT cookie.
// The request body is intentionally ignored: user data must come from the
// verified BetterAuth session, never from client-supplied fields.
app.post("/api/auth/jwt", async (req, res) => {
  try {
    const user = await getBetterAuthSession(req.headers.cookie);

    if (!user) {
      return res.status(401).json({ message: "Please login first" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: "7d" },
    );

    res.cookie(JWT_COOKIE_NAME, token, authCookieOptions());

    return res.status(200).json({ issued: true });
  } catch (error) {
    return serverError(res, "JWT issue error", error, "Could not issue session token");
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(JWT_COOKIE_NAME, clearAuthCookieOptions());
  return res.status(200).json({ success: true });
});

// ========================================
// STUDIO VALIDATION
// ========================================

function parseStudioBody(body, { partial = false } = {}) {
  const errors = [];
  const value = {};

  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const required = (key) => !partial || has(key);

  if (required("title")) {
    if (!isNonEmptyString(body.title, 120)) {
      errors.push("Title is required and must be 120 characters or fewer.");
    } else {
      value.title = body.title.trim();
    }
  }

  if (required("category")) {
    if (
      typeof body.category !== "string" ||
      !STUDIO_CATEGORIES.has(body.category)
    ) {
      errors.push(
        "Category must be one of: Photo Studios, Sound Stages, Podcast Rooms, Music Suites, Art Workshops.",
      );
    } else {
      value.category = body.category;
    }
  }

  if (required("hourlyRate")) {
    const hourlyRate = toNumber(body.hourlyRate);
    if (hourlyRate === null || hourlyRate < 0) {
      errors.push("Hourly rate must be a positive number.");
    } else {
      value.hourlyRate = roundMoney(hourlyRate);
    }
  }

  if (required("securityDeposit")) {
    const securityDeposit = toNumber(body.securityDeposit);
    if (securityDeposit === null || securityDeposit < 0) {
      errors.push("Security deposit must be a positive number.");
    } else {
      value.securityDeposit = roundMoney(securityDeposit);
    }
  }

  if (required("maxCapacity")) {
    const maxCapacity = toNumber(body.maxCapacity);
    if (
      maxCapacity === null ||
      !Number.isInteger(maxCapacity) ||
      maxCapacity < 1
    ) {
      errors.push("Max capacity must be a whole number of at least 1.");
    } else {
      value.maxCapacity = maxCapacity;
    }
  }

  if (required("location")) {
    if (!isNonEmptyString(body.location, 200)) {
      errors.push("Location is required and must be 200 characters or fewer.");
    } else {
      value.location = body.location.trim();
    }
  }

  if (required("imageUrl")) {
    if (!isHttpUrl(body.imageUrl)) {
      errors.push("Cover image must be a valid http(s) URL.");
    } else {
      value.imageUrl = body.imageUrl.trim();
    }
  }

  if (required("overview")) {
    if (!isNonEmptyString(body.overview, 5000)) {
      errors.push("Overview is required and must be 5000 characters or fewer.");
    } else {
      value.overview = body.overview.trim();
    }
  }

  if (has("gallery")) {
    if (!Array.isArray(body.gallery)) {
      errors.push("Gallery must be an array of image URLs.");
    } else if (body.gallery.length > 20) {
      errors.push("Gallery can contain at most 20 images.");
    } else {
      const gallery = [];
      for (const image of body.gallery) {
        if (!isHttpUrl(image)) {
          errors.push("Every gallery image must be a valid http(s) URL.");
          break;
        }
        gallery.push(image.trim());
      }
      if (errors.length === 0) {
        value.gallery = [...new Set(gallery)];
      }
    }
  }

  if (has("amenities")) {
    if (!Array.isArray(body.amenities)) {
      errors.push("Amenities must be an array of strings.");
    } else if (body.amenities.length > 30) {
      errors.push("Amenities can contain at most 30 items.");
    } else {
      const amenities = [];
      for (const amenity of body.amenities) {
        if (
          typeof amenity !== "string" ||
          amenity.trim().length === 0 ||
          amenity.trim().length > 60
        ) {
          errors.push("Each amenity must be text between 1 and 60 characters.");
          break;
        }
        amenities.push(amenity.trim());
      }
      if (errors.length === 0) {
        value.amenities = [...new Set(amenities)];
      }
    }
  }

  return { errors, value };
}

// ========================================
// STUDIO ROUTES
// ========================================

const SORT_OPTIONS = {
  rating: { rating: -1, createdAt: -1 },
  "price-asc": { hourlyRate: 1, createdAt: -1 },
  "price-desc": { hourlyRate: -1, createdAt: -1 },
};

// GET /api/studios
// - with ?page=... -> { studios, total, page, limit } (Explore page)
// - without ?page  -> Studio[] (home page "featured studios")
// Both shapes are already handled by the existing frontends.
app.get("/api/studios", async (req, res) => {
  try {
    const filter = {};

    const category = getQueryString(req.query.category).trim();
    if (category) filter.category = category;

    const search = getQueryString(req.query.search).trim().slice(0, 100);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { title: pattern },
        { location: pattern },
        { overview: pattern },
        { category: pattern },
      ];
    }

    const sortKey = getQueryString(req.query.sort).trim();
    const sort = SORT_OPTIONS[sortKey] || SORT_OPTIONS.rating;

    const pageParam = getQueryString(req.query.page).trim();
    const hasPage = pageParam !== "";
    const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);

    const rawLimit = Number.parseInt(
      getQueryString(req.query.limit).trim(),
      10,
    );
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : hasPage ? 9 : 12),
    );

    const skip = (page - 1) * limit;

    const [studios, total] = await Promise.all([
      studiosCollection
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      studiosCollection.countDocuments(filter),
    ]);

    if (hasPage) {
      return res.status(200).json({ studios, total, page, limit });
    }

    return res.status(200).json(studios);
  } catch (error) {
    return serverError(res, "Studio list error", error, "Failed to load studios");
  }
});

app.get("/api/studios/:id", async (req, res) => {
  try {
    const studioId = toObjectId(req.params.id);
    if (!studioId) {
      return res.status(400).json({ message: "Invalid studio ID" });
    }

    const studio = await studiosCollection.findOne({ _id: studioId });
    if (!studio) {
      return res.status(404).json({ message: "Studio not found" });
    }

    return res.status(200).json(studio);
  } catch (error) {
    return serverError(res, "Studio detail error", error, "Failed to load studio");
  }
});

app.post("/api/studios", requireAuth, async (req, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ message: "Invalid studio data" });
    }

    const { errors, value } = parseStudioBody(body, { partial: false });
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const studio = {
      ...value,
      gallery: value.gallery ?? [],
      amenities: value.amenities ?? [],
      ownerId: req.user.id,
      ownerName: req.user.name || req.user.email.split("@")[0],
      ownerEmail: req.user.email,
      rating: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
    };

    const result = await studiosCollection.insertOne(studio);

    console.log("✅ Studio created:", result.insertedId.toString());
    console.log("👤 Owner user id:", req.user.id);

    return res.status(201).json({
      success: true,
      message: "Studio created successfully",
      insertedId: result.insertedId,
      studio: { ...studio, _id: result.insertedId },
    });
  } catch (error) {
    return serverError(res, "Studio create error", error, "Failed to create studio");
  }
});

app.patch("/api/studios/:id", requireAuth, async (req, res) => {
  try {
    const studioId = toObjectId(req.params.id);
    if (!studioId) {
      return res.status(400).json({ message: "Invalid studio ID" });
    }

    const body = req.body ?? {};
    if (typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ message: "Invalid studio data" });
    }

    const { errors, value } = parseStudioBody(body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    if (Object.keys(value).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const studio = await studiosCollection.findOne({ _id: studioId });
    if (!studio) {
      return res.status(404).json({ message: "Studio not found" });
    }

    const isOwner =
      studio.ownerId === req.user.id ||
      sameEmail(studio.ownerEmail, req.user.email);

    if (!isOwner) {
      return res
        .status(403)
        .json({ message: "You can only edit your own studio" });
    }

    value.updatedAt = new Date().toISOString();

    const result = await studiosCollection.updateOne(
      { _id: studioId },
      { $set: value },
    );

    const updatedStudio = await studiosCollection.findOne({ _id: studioId });

    console.log("✅ Studio updated:", studioId.toString());
    console.log("👤 Updated by user id:", req.user.id);

    return res.status(200).json({
      success: true,
      message: "Studio updated successfully",
      modifiedCount: result.modifiedCount,
      studio: updatedStudio,
    });
  } catch (error) {
    return serverError(res, "Studio update error", error, "Failed to update studio");
  }
});

app.delete("/api/studios/:id", requireAuth, async (req, res) => {
  try {
    const studioId = toObjectId(req.params.id);
    if (!studioId) {
      return res.status(400).json({ message: "Invalid studio ID" });
    }

    const studio = await studiosCollection.findOne({ _id: studioId });
    if (!studio) {
      return res.status(404).json({ message: "Studio not found" });
    }

    const isOwner =
      studio.ownerId === req.user.id ||
      sameEmail(studio.ownerEmail, req.user.email);

    if (!isOwner) {
      return res
        .status(403)
        .json({ message: "You can only delete your own studio" });
    }

    const studioIdString = studioId.toString();

    await studiosCollection.deleteOne({ _id: studioId });

    // The listing's wishlist entries and reviews no longer make sense.
    // Bookings are intentionally kept as financial/history records.
    await Promise.allSettled([
      wishlistsCollection.deleteMany({ studioId: studioIdString }),
      reviewsCollection.deleteMany({
        studioId: { $in: [studioIdString, studioId] },
      }),
    ]);

    console.log("✅ Studio deleted:", studioIdString);
    console.log("👤 Deleted by user id:", req.user.id);

    return res.status(200).json({
      success: true,
      message: "Studio deleted successfully",
    });
  } catch (error) {
    return serverError(res, "Studio delete error", error, "Failed to delete studio");
  }
});

app.get("/api/my-studios", requireAuth, async (req, res) => {
  try {
    const studios = await studiosCollection
      .find({
        $or: [
          { ownerId: req.user.id },
          { ownerEmail: req.user.email },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(studios);
  } catch (error) {
    return serverError(res, "My studios error", error, "Failed to load your studios");
  }
});

// ========================================
// BOOKING VALIDATION
// ========================================

function parseBookingWindow(body) {
  const errors = [];

  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!isIsoDate(date)) {
    errors.push("A valid booking date is required.");
  } else if (date < todayIso()) {
    errors.push("Booking date cannot be in the past.");
  }

  const startHour = toNumber(body.startHour);
  const hours = toNumber(body.hours);

  if (
    startHour === null ||
    !Number.isInteger(startHour) ||
    startHour < 0 ||
    startHour > 23
  ) {
    errors.push("Start hour must be a whole number between 0 and 23.");
  }

  if (
    hours === null ||
    !Number.isInteger(hours) ||
    hours < 1 ||
    hours > 24
  ) {
    errors.push("Hours must be a whole number between 1 and 24.");
  }

  if (
    errors.length === 0 &&
    startHour + hours > 24
  ) {
    errors.push("A booking cannot end after midnight.");
  }

  return { errors, date, startHour, hours };
}

async function hasConfirmedOverlap({
  studioId,
  date,
  startHour,
  hours,
  excludeId = null,
}) {
  const filter = {
    studioId: String(studioId),
    date,
    status: "Confirmed",
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const confirmed = await bookingsCollection
    .find(filter)
    .project({ startHour: 1, hours: 1 })
    .toArray();

  const newStart = Number(startHour);
  const newEnd = newStart + Number(hours);

  return confirmed.some((booking) => {
    const existingStart = Number(booking.startHour);
    const existingEnd = existingStart + Number(booking.hours);
    return newStart < existingEnd && newEnd > existingStart;
  });
}

// ========================================
// BOOKING ROUTES (new client)
// ========================================

app.post("/api/bookings", requireAuth, async (req, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ message: "Invalid booking information" });
    }

    const studioId = toObjectId(body.studioId);
    if (!studioId) {
      return res.status(400).json({ message: "Invalid studio ID" });
    }

    const { errors, date, startHour, hours } = parseBookingWindow(body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const studio = await studiosCollection.findOne({ _id: studioId });
    if (!studio) {
      return res.status(404).json({ message: "Studio not found" });
    }

    const hourlyRate = toNumber(studio.hourlyRate);
    if (hourlyRate === null || hourlyRate < 0) {
      return res.status(400).json({ message: "This studio has invalid pricing" });
    }

    const overlaps = await hasConfirmedOverlap({
      studioId,
      date,
      startHour,
      hours,
    });

    if (overlaps) {
      return res.status(409).json({
        message:
          "This time overlaps a confirmed booking. Pick another slot.",
      });
    }

    const booking = {
      studioId: studioId.toString(),
      studioTitle: studio.title,
      userEmail: req.user.email,
      userName: req.user.name || "",
      userId: req.user.id,
      ownerEmail: studio.ownerEmail,
      ownerId: studio.ownerId ?? null,
      date,
      startHour,
      hours,
      totalPrice: roundMoney(hourlyRate * hours),
      securityDeposit: Math.max(
        0,
        roundMoney(toNumber(studio.securityDeposit) ?? 0),
      ),
      status: "Pending",
      createdAt: new Date().toISOString(),
    };

    const result = await bookingsCollection.insertOne(booking);

    console.log("✅ Booking created:", result.insertedId.toString());
    console.log("👤 Booking user id:", req.user.id);

    return res.status(201).json({
      success: true,
      message: "Booking saved successfully",
      insertedId: result.insertedId,
      booking: { ...booking, _id: result.insertedId },
    });
  } catch (error) {
    return serverError(res, "Booking create error", error, "Failed to add booking");
  }
});

app.get("/api/my-bookings", requireAuth, async (req, res) => {
  try {
    const bookings = await bookingsCollection
      .find({
        $or: [
          { userId: req.user.id },
          { userEmail: req.user.email },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(bookings);
  } catch (error) {
    return serverError(res, "Booking fetch error", error, "Failed to fetch bookings");
  }
});

app.get("/api/bookings/incoming", requireAuth, async (req, res) => {
  try {
    const ownedStudios = await studiosCollection
      .find({
        $or: [
          { ownerId: req.user.id },
          { ownerEmail: req.user.email },
        ],
      })
      .project({ _id: 1 })
      .toArray();

    const ownedStudioIds = ownedStudios.map((studio) =>
      String(studio._id),
    );

    const filter = {
      $or: [
        { ownerId: req.user.id },
        { ownerEmail: req.user.email },
        ...(ownedStudioIds.length > 0
          ? [{ studioId: { $in: ownedStudioIds } }]
          : []),
      ],
    };

    const bookings = await bookingsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(bookings);
  } catch (error) {
    return serverError(res, "Incoming bookings error", error, "Failed to fetch incoming bookings");
  }
});

app.patch("/api/bookings/:id/cancel", requireAuth, async (req, res) => {
  try {
    const bookingId = toObjectId(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await bookingsCollection.findOne({ _id: bookingId });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isBookingOwner =
      booking.userId === req.user.id ||
      sameEmail(booking.userEmail, req.user.email);

    if (!isBookingOwner) {
      return res
        .status(403)
        .json({ message: "You can only cancel your own booking" });
    }

    if (booking.status !== "Pending") {
      return res
        .status(400)
        .json({ message: "Only pending bookings can be cancelled" });
    }

    const now = new Date().toISOString();
    const result = await bookingsCollection.updateOne(
      { _id: bookingId, status: "Pending" },
      {
        $set: {
          status: "Cancelled",
          updatedAt: now,
          cancelledAt: now,
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(409).json({
        message: "This booking can no longer be cancelled.",
      });
    }

    console.log("✅ Booking cancelled:", bookingId.toString());
    console.log("👤 Cancelled by user id:", req.user.id);

    const updatedBooking = await bookingsCollection.findOne({
      _id: bookingId,
    });

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      booking: updatedBooking,
    });
  } catch (error) {
    return serverError(res, "Booking cancel error", error, "Failed to cancel booking");
  }
});

app.patch("/api/bookings/:id/status", requireAuth, async (req, res) => {
  try {
    const bookingId = toObjectId(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const status = req.body?.status;
    if (status !== "Confirmed" && status !== "Completed") {
      return res
        .status(400)
        .json({ message: "Status must be Confirmed or Completed" });
    }

    const booking = await bookingsCollection.findOne({ _id: bookingId });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    let ownsStudio =
      booking.ownerId === req.user.id ||
      sameEmail(booking.ownerEmail, req.user.email);

    if (!ownsStudio) {
      const studioId = toObjectId(booking.studioId);
      if (studioId) {
        const studio = await studiosCollection.findOne({
          _id: studioId,
          $or: [
            { ownerId: req.user.id },
            { ownerEmail: req.user.email },
          ],
        });
        ownsStudio = Boolean(studio);
      }
    }

    if (!ownsStudio) {
      return res.status(403).json({
        message: "Only the studio owner can update this booking",
      });
    }

    if (booking.status === "Cancelled") {
      return res
        .status(400)
        .json({ message: "Cancelled bookings cannot be updated" });
    }

    if (status === "Confirmed") {
      const overlaps = await hasConfirmedOverlap({
        studioId: booking.studioId,
        date: booking.date,
        startHour: booking.startHour,
        hours: booking.hours,
        excludeId: booking._id,
      });

      if (overlaps) {
        return res.status(409).json({
          message:
            "This time overlaps a confirmed booking. Pick another slot.",
        });
      }
    }

    const now = new Date().toISOString();
    await bookingsCollection.updateOne(
      { _id: bookingId },
      { $set: { status, updatedAt: now } },
    );

    const updatedBooking = await bookingsCollection.findOne({
      _id: bookingId,
    });

    console.log("✅ Booking status updated:", bookingId.toString());
    console.log("👤 Updated by user id:", req.user.id);

    return res.status(200).json({
      success: true,
      message: `Booking marked ${status}`,
      booking: updatedBooking,
    });
  } catch (error) {
    return serverError(res, "Booking status error", error, "Failed to update booking status");
  }
});

// ========================================
// WISHLIST ROUTES
// ========================================

app.get("/api/wishlist", requireAuth, async (req, res) => {
  try {
    const filter = {
      $or: [
        { userId: req.user.id },
        { userEmail: req.user.email },
      ],
    };

    const studioId = getQueryString(req.query.studioId).trim();
    if (studioId) {
      if (!toObjectId(studioId)) {
        return res.status(400).json({ message: "Invalid studio ID" });
      }
      filter.studioId = studioId;
    }

    const entries = await wishlistsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(entries);
  } catch (error) {
    return serverError(res, "Wishlist fetch error", error, "Failed to load wishlist");
  }
});

app.post("/api/wishlist/:studioId", requireAuth, async (req, res) => {
  try {
    const studioId = req.params.studioId;
    if (!toObjectId(studioId)) {
      return res.status(400).json({ message: "Invalid studio ID" });
    }

    const action = req.body?.action;
    if (action !== "add" && action !== "remove") {
      return res
        .status(400)
        .json({ message: "Action must be add or remove" });
    }

    if (action === "add") {
      const studio = await studiosCollection.findOne({
        _id: new ObjectId(studioId),
      });
      if (!studio) {
        return res.status(404).json({ message: "Studio not found" });
      }

      await wishlistsCollection.updateOne(
        { userId: req.user.id, studioId },
        {
          $setOnInsert: {
            userId: req.user.id,
            userEmail: req.user.email,
            studioId,
            createdAt: new Date().toISOString(),
          },
        },
        { upsert: true },
      );

      return res.status(200).json({ success: true, saved: true });
    }

    await wishlistsCollection.deleteMany({
      studioId,
      $or: [
        { userId: req.user.id },
        { userEmail: req.user.email },
      ],
    });

    return res.status(200).json({ success: true, saved: false });
  } catch (error) {
    return serverError(res, "Wishlist update error", error, "Failed to update wishlist");
  }
});

// ========================================
// DASHBOARD STATS
// ========================================

app.get("/api/dashboard-stats", requireAuth, async (req, res) => {
  try {
    const [listings, bookings, pending] = await Promise.all([
      studiosCollection.countDocuments({
        $or: [
          { ownerId: req.user.id },
          { ownerEmail: req.user.email },
        ],
      }),
      bookingsCollection.countDocuments({
        $or: [
          { userId: req.user.id },
          { userEmail: req.user.email },
        ],
      }),
      bookingsCollection.countDocuments({
        status: "Pending",
        $or: [
          { ownerId: req.user.id },
          { ownerEmail: req.user.email },
        ],
      }),
    ]);

    return res.status(200).json({ listings, bookings, pending });
  } catch (error) {
    return serverError(res, "Dashboard stats error", error, "Failed to load dashboard stats");
  }
});

// ========================================
// SINGER FORM API (legacy frontend)
// ========================================

const SINGER_FORM_FIELDS = [
  "name",
  "email",
  "phone",
  "dob",
  "gender",
  "city",
  "genre",
  "level",
  "voice",
  "songTitle",
  "link",
  "sessionDate",
  "sessionTime",
  "hours",
  "needBacking",
  "about",
  "agree",
];

app.post("/singer-form", async (req, res) => {
  try {
    console.log("📩 Singer form received");

    const body = req.body;
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length === 0
    ) {
      return res.status(400).json({ message: "Invalid form data" });
    }

    const singerData = {};
    for (const field of SINGER_FORM_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        singerData[field] = body[field];
      }
    }

    if (
      !isNonEmptyString(singerData.name, 120) ||
      !isNonEmptyString(singerData.email, 200)
    ) {
      return res
        .status(400)
        .json({ message: "Name and email are required" });
    }

    const result = await singerCollection.insertOne(singerData);

    console.log("✅ Singer form saved:", result.insertedId.toString());

    return res.status(201).json({
      success: true,
      insertedId: result.insertedId,
    });
  } catch (error) {
    return serverError(res, "Singer form error", error, "Failed to save singer form");
  }
});

// ========================================
// LEGACY BOOKING API (old frontend)
// ========================================

app.post("/my-bookings", requireAuth, async (req, res) => {
  try {
    console.log("📩 New booking request received");

    const body = req.body ?? {};
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
    } = body;

    const numericHours = toNumber(hours);
    const numericTotal = toNumber(total);

    if (
      !isNonEmptyString(studioId, 100) ||
      !isNonEmptyString(studioName, 200) ||
      !isNonEmptyString(date, 40) ||
      !isNonEmptyString(time, 20) ||
      numericHours === null ||
      numericHours < 1 ||
      numericTotal === null ||
      numericTotal < 0
    ) {
      console.log("❌ Invalid booking information");
      return res.status(400).json({ message: "Invalid booking information" });
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

    console.log("✅ Booking saved:", result.insertedId.toString());
    console.log("👤 Booking user id:", req.user.id);

    return res.status(201).json({
      success: true,
      message: "Booking saved successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    return serverError(res, "Booking insert error", error, "Failed to add booking");
  }
});

app.get("/my-bookings", requireAuth, async (req, res) => {
  try {
    const bookings = await myBookingsCollection
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    console.log("✅ Bookings fetched:", bookings.length);

    return res.status(200).json(bookings);
  } catch (error) {
    return serverError(res, "Booking fetch error", error, "Failed to fetch bookings");
  }
});

app.put("/my-bookings/:id", requireAuth, async (req, res) => {
  try {
    const bookingId = toObjectId(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const { date, time, hours } = req.body ?? {};
    const numericHours = toNumber(hours);

    if (
      !isNonEmptyString(date, 40) ||
      !isNonEmptyString(time, 20) ||
      numericHours === null ||
      numericHours < 1
    ) {
      return res.status(400).json({ message: "Invalid booking information" });
    }

    const booking = await myBookingsCollection.findOne({
      _id: bookingId,
      userId: req.user.id,
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const previousHours = toNumber(booking.hours);
    const previousTotal = toNumber(booking.total);

    if (
      previousHours === null ||
      previousHours <= 0 ||
      previousTotal === null
    ) {
      return res
        .status(400)
        .json({ message: "This booking cannot be updated" });
    }

    const updatedTotal = roundMoney(
      (previousTotal / previousHours) * numericHours,
    );

    const result = await myBookingsCollection.updateOne(
      { _id: bookingId, userId: req.user.id },
      {
        $set: {
          date,
          time,
          hours: numericHours,
          total: updatedTotal,
          updatedAt: new Date().toISOString(),
        },
      },
    );

    console.log("✅ Booking updated:", bookingId.toString());
    console.log("👤 Updated by user id:", req.user.id);

    return res.status(200).json({
      success: true,
      message: "Booking updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return serverError(res, "Booking update error", error, "Failed to update booking");
  }
});

app.delete("/my-bookings/:id", requireAuth, async (req, res) => {
  try {
    const bookingId = toObjectId(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const result = await myBookingsCollection.deleteOne({
      _id: bookingId,
      userId: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    console.log("✅ Booking cancelled:", bookingId.toString());
    console.log("👤 Cancelled by user id:", req.user.id);

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    return serverError(res, "Booking delete error", error, "Failed to cancel booking");
  }
});

// ========================================
// SERVER HEALTH CHECK
// ========================================

app.get("/", (req, res) => {
  res.status(200).send("StudioSpace Server is Running!");
});

// ========================================
// NOT FOUND + ERROR HANDLERS
// ========================================

app.use((req, res) => {
  return res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    "body" in error
  ) {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large" });
  }

  if (
    typeof error.message === "string" &&
    error.message.startsWith("CORS:")
  ) {
    return res.status(403).json({ message: "Origin not allowed" });
  }

  console.error("❌ Unhandled error:", error?.message || error);
  return res.status(500).json({ message: "Internal server error" });
});

// ========================================
// START + GRACEFUL SHUTDOWN
// ========================================

const servers = [];
let shuttingDown = false;

function startListener(port, label, critical) {
  const server = app.listen(port, () => {
    console.log(`🚀 ${label} running on http://localhost:${port}`);
  });

  server.on("error", (error) => {
    console.error(
      `❌ Could not start ${label} on port ${port}:`,
      error.message,
    );
    if (critical) process.exit(1);
  });

  return server;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n🛑 ${signal} received. Shutting down...`);

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  await Promise.allSettled(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );

  await client.close().catch(() => {});
  clearTimeout(forceExit);

  console.log("✅ Server closed cleanly.");
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  console.error(
    "❌ Unhandled promise rejection:",
    reason instanceof Error ? reason.message : reason,
  );
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error.message);
  void shutdown("uncaughtException");
});

servers.push(startListener(PORT, "API server", true));

if (LEGACY_PORT && LEGACY_PORT !== PORT) {
  servers.push(
    startListener(
      LEGACY_PORT,
      "Legacy compatibility server",
      false,
    ),
  );
}

console.log(`🔐 Better Auth URL: ${BETTER_AUTH_URL}`);
