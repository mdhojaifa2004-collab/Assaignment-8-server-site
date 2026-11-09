import { MongoClient } from "mongodb";
import "dotenv/config";

// Optional demo data for the StudioSpace assignment.
// Run with: npm run seed
// It is idempotent: existing seeded documents are never overwritten.

const mongoUri = process.env.MONGO_DB_SERVER || process.env.MONGODB_URI;
const dbName = process.env.MONGO_DB_NAME || "studiospace";

if (!mongoUri) {
  console.error("❌ MONGO_DB_SERVER (or MONGODB_URI) is missing in .env");
  process.exit(1);
}

const OWNER_EMAIL = "examiner@studiospace.com";
const OWNER_NAME = "StudioSpace Examiner";
const RENTER_EMAIL = "demo-renter@studiospace.com";
const RENTER_NAME = "Demo Renter";

const studios = [
  {
    seedKey: "seed-studio-1",
    title: "Sunlit Loft with 14ft Cyc Wall",
    category: "Photo Studios",
    hourlyRate: 85,
    securityDeposit: 150,
    maxCapacity: 10,
    location: "Gulshan, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["14ft cyc wall", "Strobe kits", "Blackout curtains", "Makeup room"],
    overview:
      "A bright production loft with a seamless cyc wall, fast strobes and a private styling room. Ideal for fashion, product and portrait shoots.",
    rating: 4.9,
    reviewCount: 128,
  },
  {
    seedKey: "seed-studio-2",
    title: "The Black Box Sound Stage",
    category: "Sound Stages",
    hourlyRate: 120,
    securityDeposit: 200,
    maxCapacity: 18,
    location: "Tejgaon, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Acoustic treatment", "DMX lighting", "Loading bay", "Green room"],
    overview:
      "A blacked-out stage built for film and commercial work, with a wide loading bay, rigging points and quiet HVAC.",
    rating: 4.8,
    reviewCount: 74,
  },
  {
    seedKey: "seed-studio-3",
    title: "Riverside Podcast Studio",
    category: "Podcast Rooms",
    hourlyRate: 35,
    securityDeposit: 50,
    maxCapacity: 4,
    location: "Banani, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["4 Shure mics", "Rodecaster mixer", "Headphones", "Remote guest link"],
    overview:
      "A quiet riverside booth with four microphones, a Rodecaster mixer and a fast connection for remote guests.",
    rating: 4.7,
    reviewCount: 96,
  },
  {
    seedKey: "seed-studio-4",
    title: "Analog Warmth Music Suite",
    category: "Music Suites",
    hourlyRate: 75,
    securityDeposit: 120,
    maxCapacity: 8,
    location: "Dhanmondi, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Grand piano", "Vintage amps", "Drum kit", "Pro Tools rig"],
    overview:
      "A warm tracking room with a grand piano, vintage amplifiers and a drum kit. Perfect for bands and singer-songwriters.",
    rating: 4.8,
    reviewCount: 61,
  },
  {
    seedKey: "seed-studio-5",
    title: "Clay & Canvas Art Workshop",
    category: "Art Workshops",
    hourlyRate: 28,
    securityDeposit: 40,
    maxCapacity: 12,
    location: "Lalmatia, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Pottery wheels", "Kiln access", "Easels", "Sink station"],
    overview:
      "A messy-friendly workshop with pottery wheels, easels and a kiln. Book it for classes, shoots or your next making session.",
    rating: 4.6,
    reviewCount: 43,
  },
  {
    seedKey: "seed-studio-6",
    title: "Northlight Portrait Studio",
    category: "Photo Studios",
    hourlyRate: 55,
    securityDeposit: 80,
    maxCapacity: 6,
    location: "Uttara, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Softboxes", "Seamless paper", "Tethering desk", "Client sofa"],
    overview:
      "A compact portrait studio with north-facing light, softboxes and a comfortable client area for family and headshot sessions.",
    rating: 4.5,
    reviewCount: 52,
  },
  {
    seedKey: "seed-studio-7",
    title: "Harbor Film Stage",
    category: "Sound Stages",
    hourlyRate: 140,
    securityDeposit: 250,
    maxCapacity: 25,
    location: "Chattogram Port, Chattogram",
    imageUrl:
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Drive-in access", "3-phase power", "Rigging grid", "Edit bay"],
    overview:
      "A large harbor-side stage with drive-in access and three-phase power. Built for commercials and short films.",
    rating: 4.9,
    reviewCount: 88,
  },
  {
    seedKey: "seed-studio-8",
    title: "Minimal Mic Booth",
    category: "Podcast Rooms",
    hourlyRate: 22,
    securityDeposit: 30,
    maxCapacity: 2,
    location: "Zindabazar, Sylhet",
    imageUrl:
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["2 mics", "Acoustic foam", "USB interface", "Editing laptop"],
    overview:
      "A tiny, quiet booth for solo podcasts and voiceover work. Bring a script, plug in and record.",
    rating: 4.4,
    reviewCount: 37,
  },
  {
    seedKey: "seed-studio-9",
    title: "Neon Rehearsal Room",
    category: "Music Suites",
    hourlyRate: 45,
    securityDeposit: 60,
    maxCapacity: 10,
    location: "Agrabad, Chattogram",
    imageUrl:
      "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Full backline", "PA system", "Neon lighting", "Mirror wall"],
    overview:
      "A loud-and-proud rehearsal room with a full backline, PA and neon lighting for late-night sessions.",
    rating: 4.6,
    reviewCount: 69,
  },
  {
    seedKey: "seed-studio-10",
    title: "Printmaking & Zine Lab",
    category: "Art Workshops",
    hourlyRate: 32,
    securityDeposit: 45,
    maxCapacity: 8,
    location: "Shahbagh, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Screen press", "Ink station", "Drying racks", "Paper cutter"],
    overview:
      "A print lab for screen printing, zines and small editions. Ink, screens and drying racks are included.",
    rating: 4.7,
    reviewCount: 31,
  },
  {
    seedKey: "seed-studio-11",
    title: "Rooftop Daylight Studio",
    category: "Photo Studios",
    hourlyRate: 65,
    securityDeposit: 100,
    maxCapacity: 8,
    location: "Bashundhara, Dhaka",
    imageUrl:
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Rooftop access", "Golden-hour light", "Prop wall", "Wi-Fi"],
    overview:
      "A rooftop studio with open sky and golden-hour light. Great for lifestyle, editorial and content shoots.",
    rating: 4.5,
    reviewCount: 58,
  },
  {
    seedKey: "seed-studio-12",
    title: "Acoustic Tracking Stage",
    category: "Sound Stages",
    hourlyRate: 95,
    securityDeposit: 150,
    maxCapacity: 14,
    location: "Khulshi, Chattogram",
    imageUrl:
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
    ],
    amenities: ["Live room", "Isolation booths", "Console", "Mic locker"],
    overview:
      "A treated live room with two isolation booths and a deep mic locker for full-band tracking.",
    rating: 4.8,
    reviewCount: 47,
  },
];

const client = new MongoClient(mongoUri);

try {
  await client.connect();
  const db = client.db(dbName);
  const studiosCollection = db.collection("studios");
  const bookingsCollection = db.collection("bookings");

  const now = Date.now();

  const studioResult = await studiosCollection.bulkWrite(
    studios.map((studio, index) => ({
      updateOne: {
        filter: { seedKey: studio.seedKey },
        update: {
          $setOnInsert: {
            ...studio,
            ownerId: null,
            ownerName: OWNER_NAME,
            ownerEmail: OWNER_EMAIL,
            createdAt: new Date(now - index * 60_000).toISOString(),
          },
        },
        upsert: true,
      },
    })),
  );

  const firstStudio = await studiosCollection.findOne({
    seedKey: "seed-studio-1",
  });

  if (firstStudio) {
    const studioId = firstStudio._id.toString();
    const hourlyRate = Number(firstStudio.hourlyRate) || 0;
    const securityDeposit = Number(firstStudio.securityDeposit) || 0;

    const demoBookings = [
      {
        seedKey: "seed-booking-1",
        studioId,
        studioTitle: firstStudio.title,
        userEmail: RENTER_EMAIL,
        userName: RENTER_NAME,
        userId: "seed-renter",
        ownerEmail: OWNER_EMAIL,
        ownerId: null,
        date: "2030-01-15",
        startHour: 9,
        hours: 2,
        totalPrice: hourlyRate * 2,
        securityDeposit,
        status: "Confirmed",
        createdAt: new Date().toISOString(),
      },
      {
        seedKey: "seed-booking-2",
        studioId,
        studioTitle: firstStudio.title,
        userEmail: RENTER_EMAIL,
        userName: RENTER_NAME,
        userId: "seed-renter",
        ownerEmail: OWNER_EMAIL,
        ownerId: null,
        date: "2030-01-16",
        startHour: 14,
        hours: 3,
        totalPrice: hourlyRate * 3,
        securityDeposit,
        status: "Confirmed",
        createdAt: new Date().toISOString(),
      },
    ];

    await bookingsCollection.bulkWrite(
      demoBookings.map((booking) => ({
        updateOne: {
          filter: { seedKey: booking.seedKey },
          update: { $setOnInsert: booking },
          upsert: true,
        },
      })),
    );
  }

  console.log(`✅ Seed complete in database "${dbName}".`);
  console.log(
    `   Studios inserted: ${studioResult.upsertedCount} (existing seeded studios were kept).`,
  );
  console.log("   Demo bookings: 2030-01-15 09:00-11:00 and 2030-01-16 14:00-17:00.");
} catch (error) {
  console.error("❌ Seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
