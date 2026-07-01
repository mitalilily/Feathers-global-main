import type { KycDetails } from "../types/user.types";
import axiosInstance from "./axiosInstance";

export type SubmitKycPayload = Partial<KycDetails> & { draft?: boolean };

export const submitKyc = async (details: SubmitKycPayload) => {
  const { data } = await axiosInstance.post("/profile/kyc", details);
  return data;
};

export const getKyc = async () => {
  const { data } = await axiosInstance.get("/profile/kyc");
  return data;
};

// services/kycOCR.ts
export interface ExtractTextResponse {
  text: string;
}
