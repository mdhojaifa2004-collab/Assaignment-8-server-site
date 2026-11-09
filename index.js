
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8000;

// ========================================
// MIDDLEWARE
// ========================================

const allowedOrigins = (
  process.env.CLIENT_ORIGINS ||
  "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());


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