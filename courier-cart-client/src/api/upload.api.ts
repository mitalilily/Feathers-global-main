import axios from "axios";
import axiosInstance from "./axiosInstance";

export interface UploadedFileInfo {
  url: string;
  key: string;
  originalName: string;
  size: number;
  mime: string;
}

export const uploadFileToStorage = async (
  file: File,
  folder?: string,
  onProgress?: (progress: number) => void
): Promise<UploadedFileInfo> => {
  const { data } = await axiosInstance.post("/uploads/presign", {
    contentType: file.type || "application/octet-stream",
    filename: file.name,
    folder,
  });

  await axios.put(data.uploadUrl, file, {
    withCredentials: false,
    headers: { "Content-Type": file.type },
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });

  return {
    url: data.publicUrl,
    key: data.key,
    originalName: file.name,
    size: file.size,
    mime: file.type,
  };
};

export const getPresignedDownloadUrls = async (
  keys: string | string[]
): Promise<string | Array<string | null>> => {
  const response = await axiosInstance.post("/uploads/presign-download-url", {
    keys,
  });

  if (Array.isArray(keys)) {
    return (response.data.urls || []) as Array<string | null>;
  } else {
    return response.data.url as string;
  }
};
