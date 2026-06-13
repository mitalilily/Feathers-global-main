import { useMutation, useQuery } from "@tanstack/react-query";
import type { KycDetails } from "../../../types/user.types";
import { getKyc, submitKyc, type SubmitKycPayload } from "../../../api/kyc";

export const useSubmitKyc = () =>
  useMutation({
    mutationFn: ({ details, draft = false }: { details: Partial<KycDetails>; draft?: boolean }) =>
      submitKyc({ ...details, draft } as SubmitKycPayload),
  });

export const useUserKyc = () =>
  useQuery({
    queryKey: ["userKyc"],
    queryFn: () => getKyc(),
    refetchOnWindowFocus: false,
  });
