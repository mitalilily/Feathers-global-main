import { createReadStream } from 'fs'
import { mkdir, stat, writeFile } from 'fs/promises'
import path from 'path'
import { Request, Response } from 'express';
import {
  presignDownload,
  presignUpload,
} from "../models/services/upload.service";
import { getBucketName } from "../utils/functions";
import { sanitizeFilename } from '../utils/functions'
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "../config/r2Client";

const kycStorageRoot = path.resolve(process.cwd(), 'storage', 'kyc')

const getApiPublicBaseUrl = (req: Request) => {
  const configuredBase = process.env.API_PUBLIC_URL || process.env.API_URL
  if (configuredBase) return configuredBase.replace(/\/+$/, '')
  return `${req.protocol}://${req.get('host')}/api`
}

const buildKycPublicUrl = (req: Request, userId: string, fileName: string) =>
  `${getApiPublicBaseUrl(req)}/uploads/kyc/pdf/${encodeURIComponent(userId)}/${encodeURIComponent(
    fileName,
  )}`

export const createPresignedUrl = async (
  req: any,
  res: Response
): Promise<any> => {
  const { filename, contentType, folder } = req.body;
  const { sub } = req?.user;

  if (!filename || !contentType) {
    return res.status(400).json({ message: "filename & contentType required" });
  }

  try {
    const data = await presignUpload({
      filename,
      contentType,
      userId: sub,
      folderKey: folder,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("Presign error:", err);
    return res.status(500).json({ message: "Failed to presign URL" });
  }
};

export const uploadLocalKycPdf = async (req: any, res: Response): Promise<any> => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'file is required' })
    }

    const mime = String(req.file.mimetype || '').toLowerCase()
    const filename = String(req.file.originalname || 'kyc-document.pdf')
    if (!mime.includes('pdf') && !filename.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ message: 'Only PDF files are allowed for backend KYC storage' })
    }

    const userId = String(req.user?.sub || req.user?.id || '').trim()
    if (!userId) {
      return res.status(400).json({ message: 'Unable to resolve user identity for upload' })
    }

    const safeName = sanitizeFilename(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
    const storedFileName = `${Date.now()}-${safeName}`
    const userDir = path.join(kycStorageRoot, userId)
    await mkdir(userDir, { recursive: true })

    const absolutePath = path.join(userDir, storedFileName)
    await writeFile(absolutePath, req.file.buffer)

    const publicUrl = buildKycPublicUrl(req, userId, storedFileName)

    return res.status(200).json({
      key: publicUrl,
      url: publicUrl,
      originalName: filename,
      size: req.file.size,
      mime: req.file.mimetype || 'application/pdf',
      storage: 'backend',
    })
  } catch (err: any) {
    console.error('Failed to store KYC PDF locally:', err)
    return res.status(500).json({ message: 'Failed to store KYC PDF' })
  }
}

export const getLocalKycPdf = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = String(req.params.userId || '').trim()
    const fileName = path.basename(String(req.params.filename || '').trim())

    if (!userId || !fileName) {
      return res.status(400).json({ message: 'userId and filename are required' })
    }

    const absolutePath = path.join(kycStorageRoot, userId, fileName)
    await stat(absolutePath)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
    const stream = createReadStream(absolutePath)
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to stream KYC PDF' })
      } else {
        res.end()
      }
    })
    return stream.pipe(res)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return res.status(404).json({ message: 'KYC PDF not found' })
    }
    console.error('Failed to stream local KYC PDF:', err)
    return res.status(500).json({ message: 'Failed to stream KYC PDF' })
  }
}

export const getPresignedDownloadUrl = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { keys } = req.body;

    // Validate payload
    if (!keys || (typeof keys !== "string" && !Array.isArray(keys))) {
      return res
        .status(400)
        .json({ message: "'keys' must be a string or string[]" });
    }

    // Generate signed URL(s)
    const result = await presignDownload(keys, { checkExists: true });

    if (Array.isArray(keys)) {
      const urls = Array.isArray(result) ? result : [];
      const missingFiles = keys.filter((_, index) => !urls[index]);
      const foundCount = urls.filter(Boolean).length;
      const missingCount = missingFiles.length;

      if (missingFiles.length > 0) {
        console.warn(`⚠️ Some files not found in storage:`, missingFiles);
      }

      const message =
        missingCount === 0
          ? 'Download links are ready.'
          : foundCount > 0
            ? `${foundCount} file(s) are ready. ${missingCount} file(s) could not be found or have not been generated yet.`
            : 'None of the requested files are available yet. They may still be generating or may need to be regenerated.';

      return res.status(200).json({
        urls,
        foundCount,
        missingCount,
        missingFiles,
        message,
      });
    } else {
      if (!result || result === null) {
        return res.status(404).json({ 
          message: "This file is not available yet. It may still be generating or may need to be regenerated.",
          key: keys 
        });
      }
      return res.status(200).json({ url: result as string });
    }
  } catch (error) {
    console.error("Presign download failed:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate download URL(s)" });
  }
};
