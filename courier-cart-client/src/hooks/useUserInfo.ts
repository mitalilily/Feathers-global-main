import { useQuery } from "@tanstack/react-query";
import { getUserInfo } from "../api/user";
import { getUserInfoQueryKey } from "../utils/authQueryKeys";

export const useUserInfo = (authScope?: string) =>
  useQuery({
    queryKey: getUserInfoQueryKey(authScope),
    queryFn: () => getUserInfo(),
    enabled: true,
    refetchOnWindowFocus: false,
  });
