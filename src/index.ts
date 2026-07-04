import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import adminRoutes from "./routes/auth.route";
import publicRoutes from "./routes/public.route";
import jobRoutes from "./routes/job.route";

const app = express();
const PORT = process.env.PORT || 8000;


app.all("/api/auth/*any", toNodeHandler(auth));

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:8000", 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use(express.json());

// Custom Feature Routes
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/jobs", jobRoutes);

app.get("/", (req, res) => {
  res.send("Lets fucking gooo");
});

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
