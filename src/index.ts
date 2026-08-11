import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import adminRoutes from "./routes/auth.route.js";
import publicRoutes from "./routes/public.route.js";
import jobRoutes from "./routes/job.route.js";
import whatsappRoutes from "./routes/whatsapp.route.js"

const app = express();
const PORT = process.env.PORT || 8000;

export const FRONTEND_URL = process.env.FRONTEND_URL;

if (!FRONTEND_URL) throw Error("Frontend URL is missing");

// Remove any accidental trailing slashes from the environment variable
const rawFrontendUrl = FRONTEND_URL || "http://localhost:5173";
const frontendUrl = rawFrontendUrl.endsWith("/") 
  ? rawFrontendUrl.slice(0, -1) 
  : rawFrontendUrl;

const allowedOrigins = [
  frontendUrl,
  "https://project-safe-hire.netlify.app",
  "http://localhost:5173",
];



app.use(
  cors({
    origin: allowedOrigins, 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
  }),
);

app.all("/api/auth/*any", toNodeHandler(auth));
// app.use(express.urlencoded({ extended: true }));

// app.use(express.json());

// // Custom Feature Routes
// app.use("/api/admin", adminRoutes);
// app.use("/api/public", publicRoutes);
// app.use("/api/jobs", jobRoutes);

const apiRouter = express.Router();
apiRouter.use(express.json());
apiRouter.use(express.urlencoded({ extended: true }));

// Mount feature routers on the JSON-parsed apiRouter
apiRouter.use("/admin", adminRoutes);   // Handles POST /api/admin/companies/onboard
apiRouter.use("/public", publicRoutes);
apiRouter.use("/jobs", jobRoutes);
apiRouter.use("/whatsapp", whatsappRoutes);

// Mount the apiRouter at /api
app.use("/api", apiRouter);

app.get("/", (req, res) => {
  res.send("Lets fucking gooo");
});

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
