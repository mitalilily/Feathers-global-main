import { Router } from "express";
import {
  createPresignedUrl,
  getLocalKycPdf,
  getPresignedDownloadUrl,
  uploadLocalKycPdf,
} from "../controllers/upload.controller";
import { requireAuth } from "../middlewares/requireAuth";
import { upload } from '../middlewares/upload'

const router = Router();

router.post("/presign", requireAuth, createPresignedUrl);
router.post("/presign-download-url", requireAuth, getPresignedDownloadUrl);
router.post('/kyc/pdf', requireAuth, upload.single('file'), uploadLocalKycPdf)
router.get('/kyc/pdf/:userId/:filename', getLocalKycPdf)

export default router;
