import express from "express";
import { Router } from "express";
import {
  createPresignedUrl,
  getPresignedDownloadUrl,
  uploadDirectWithToken,
  uploadFileThroughBackend,
} from "../controllers/upload.controller";
import { upload } from "../middlewares/upload";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.post("/presign", requireAuth, createPresignedUrl);
router.put("/direct", express.raw({ type: "*/*", limit: "10mb" }), uploadDirectWithToken);
router.post("/file", requireAuth, upload.single('file'), uploadFileThroughBackend);
router.post("/kyc/pdf", requireAuth, upload.single('file'), uploadFileThroughBackend);
router.post("/presign-download-url", requireAuth, getPresignedDownloadUrl);

export default router;
