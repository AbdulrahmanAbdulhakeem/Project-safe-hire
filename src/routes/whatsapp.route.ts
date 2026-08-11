import { Router } from "express";
import { whatsappWebhook } from "../controllers/whatsapp.controller.js";

const router = Router();

router.post("/webhook", whatsappWebhook);

export default router;