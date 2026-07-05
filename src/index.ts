import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import adminRoutes from "./routes/auth.route";
import publicRoutes from "./routes/public.route";
import jobRoutes from "./routes/job.route";

const app = express();
const PORT = process.env.PORT || 8000;

export const FRONTEND_URL = process.env.FRONTEND_URL;

if (!FRONTEND_URL) throw Error("Frontend URL is missing");



app.use(
  cors({
    origin: FRONTEND_URL, 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.all("/api/auth/*any", toNodeHandler(auth));
app.use(express.urlencoded({ extended: true }));

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
