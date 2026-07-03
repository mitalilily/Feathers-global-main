import { useQuery } from "@tanstack/react-query";
import { getUserInfo } from "../api/user";
import { getUserInfoQueryKey } from "../utils/authQueryKeys";

export const useUserInfo = () =>
  useQuery({
    queryKey: getUserInfoQueryKey(),
    queryFn: () => getUserInfo(),
    enabled: true,
    refetchOnWindowFocus: false,
  });
