import { Request, Response } from "express";
import {
  createBackendDownloadUrl,
  createDirectUploadToken,
  presignUpload,
  uploadBufferToStorage,
  uploadBufferToStorageTarget,
  shouldProxyBrowserUpload,
  verifyDirectDownloadToken,
  verifyDirectUploadToken,
} from "../models/services/upload.service";
import { getBucketName } from "../utils/functions";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "../config/r2Client";

const streamBodyToBuffer = async (body: any): Promise<Buffer> => {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

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
    if (
      shouldProxyBrowserUpload({
        filename,
        contentType,
        folderKey: folder,
      })
    ) {
      const uploaded = await presignUpload({
        filename,
        contentType,
        userId: sub,
        folderKey: folder,
      });
      const token = createDirectUploadToken({
        bucket: uploaded.bucket,
        key: uploaded.key,
        publicUrl: uploaded.publicUrl,
        contentType,
        originalName: filename,
        userId: sub,
      });
      const apiBaseUrl = String(
        process.env.API_URL || process.env.PUBLIC_API_URL || "https://api.fgship.in",
      ).trim().replace(/\/+$/, "");

      return res.status(200).json({
        ...uploaded,
        uploadUrl: `${apiBaseUrl}/api/uploads/direct?token=${encodeURIComponent(token)}`,
        uploadMode: "backend-proxy",
      });
    }

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

export const uploadDirectWithToken = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const token = String(req.query?.token || "").trim();

  if (!token) {
    return res.status(400).json({ message: "token is required" });
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ message: "file body is required" });
  }

  try {
    const payload = verifyDirectUploadToken(token);

    await uploadBufferToStorageTarget({
      buffer: req.body,
      bucket: payload.bucket,
      key: payload.key,
      contentType: String(req.headers["content-type"] || payload.contentType || "application/octet-stream"),
    });

    return res.status(200).json({
      success: true,
      key: payload.key,
      bucket: payload.bucket,
      publicUrl: payload.publicUrl,
    });
  } catch (err) {
    console.error("Direct upload proxy failed:", err);
    return res.status(401).json({ message: "Upload token is invalid or expired" });
  }
};

export const downloadWithToken = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const token = String(req.query?.token || "").trim();

  if (!token) {
    return res.status(400).json({ message: "token is required" });
  }

  try {
    const payload = verifyDirectDownloadToken(token);
    const result = await r2.send(
      new GetObjectCommand({
        Bucket: payload.bucket,
        Key: payload.key,
      }),
    );
    const buffer = await streamBodyToBuffer(result.Body);
    const downloadName =
      payload.downloadName ||
      String(payload.key || "download.pdf").split("/").filter(Boolean).pop() ||
      "download.pdf";
    const disposition = payload.disposition || "attachment";

    res.setHeader("Content-Type", payload.contentType || result.ContentType || "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${downloadName.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(buffer);
  } catch (err: any) {
    const statusCode = [403, 404].includes(Number(err?.$metadata?.httpStatusCode))
      ? 404
      : 401;
    console.error("Download proxy failed:", {
      statusCode,
      message: err?.message || err,
    });
    return res.status(statusCode).json({
      message:
        statusCode === 404
          ? "This file is not available yet. It may still be generating or may need to be regenerated."
          : "Download token is invalid or expired",
    });
  }
};

export const uploadFileThroughBackend = async (
  req: any,
  res: Response
): Promise<any> => {
  const file = req.file;
  const folder = String(req.body?.folder || 'userPp').trim() || 'userPp';
  const { sub } = req?.user || {};

  if (!sub) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!file?.buffer || !file?.originalname) {
    return res.status(400).json({ message: 'file is required' });
  }

  try {
    const uploaded = await uploadBufferToStorage({
      buffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype || 'application/octet-stream',
      userId: sub,
      folderKey: folder,
    });

    return res.status(200).json({
      url: uploaded.publicUrl,
      key: uploaded.key,
      originalName: file.originalname,
      size: file.size,
      mime: file.mimetype || 'application/octet-stream',
      bucket: uploaded.bucket,
    });
  } catch (err) {
    console.error('Backend file upload failed:', err);
    return res.status(500).json({ message: 'Failed to upload file' });
  }
};

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

    if (Array.isArray(keys)) {
      const urls = keys.map((key) =>
        createBackendDownloadUrl(String(key || ""), {
          disposition: "attachment",
          contentType: "application/pdf",
        }),
      );
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
      const result = createBackendDownloadUrl(String(keys), {
        disposition: "attachment",
        contentType: "application/pdf",
      });
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
