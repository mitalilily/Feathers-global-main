import { Router } from "express";
import {
  createPresignedUrl,
  getPresignedDownloadUrl,
  uploadFileThroughBackend,
} from "../controllers/upload.controller";
import { upload } from "../middlewares/upload";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.post("/presign", requireAuth, createPresignedUrl);
router.post("/file", requireAuth, upload.single('file'), uploadFileThroughBackend);
router.post("/kyc/pdf", requireAuth, upload.single('file'), uploadFileThroughBackend);
router.post("/presign-download-url", requireAuth, getPresignedDownloadUrl);

export default router;
