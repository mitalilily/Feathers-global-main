import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { SiShopify } from "react-icons/si";
import { useEffect, useState } from "react";
import { useStartShopifyOAuth } from "../../hooks/useIntegrations";
import { toast } from "../UI/Toast";
import { useAuth } from "../../context/auth/AuthContext";
import ShopifyConnectionModal from "./ShopifyConnectionModal";
import { useLocation, useNavigate } from "react-router-dom";

interface IShopifyIntegrationProps {
  fullWidth?: boolean;
  forOnboarding?: boolean;
  fromChannelList?: boolean;
}

export interface ShopifyForm {
  storeUrl: string;
  apiKey?: string;
  webhookSecret?: string;
  name?: string;
  adminApiAccessToken?: string;
  hostName?: string;
  domain?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
  userId?: string;
  status?: "active" | "inactive";
  settings?: {
    fulfillTrigger?: string;
    customerNotifyOnFulfill?: string;
    orderTagsToFetch?: string;
    codTags?: string;
    prepaidTags?: string;
    autoUpdateShipmentStatus?: boolean;
    autoCancelOrders?: boolean;
    markCodPaidOnDelivery?: boolean;
  };
}

const normalizeShopifyStoreUrl = (value?: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .replace(/\/admin(?:\/.*)?$/, '')

export default function ShopifyIntegration({
  fullWidth,
  forOnboarding = false,
}: IShopifyIntegrationProps) {
  const { user: userData } = useAuth();
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [openModal, setOpenModal] = useState<boolean>(false);

  const [shopifyDetails, setShopifyDetails] = useState<ShopifyForm>({
    storeUrl: "",
    apiKey: "",
    webhookSecret: "",
    adminApiAccessToken: "",
    userId: "",
    status: "active",
    settings: {
      fulfillTrigger: "do_not_fulfill",
      customerNotifyOnFulfill: "do_not_notify",
    },
  });

  const [inputErrors, setInputErrors] = useState<{
    storeUrl?: string;
  }>({
    storeUrl: undefined,
  });

  const { mutate: startOAuth, isPending: integrating } = useStartShopifyOAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shop = normalizeShopifyStoreUrl(params.get("shop") || "");
    const status = params.get("shopify");
    const message = params.get("message");
    let shouldReplaceUrl = false;

    if (params.get("shopifyInstall") === "1" && shop) {
      setShopifyDetails((prev) => ({ ...prev, storeUrl: shop }));
      setOpenModal(true);
      params.delete("shopifyInstall");
      shouldReplaceUrl = true;
    }

    if (status === "connected" || status === "error") {
      if (shop) {
        setShopifyDetails((prev) => ({ ...prev, storeUrl: shop }));
      }

      toast.open({
        message:
          message ||
          (status === "connected"
            ? "Shopify connected successfully."
            : "Shopify connection failed."),
        severity: status === "connected" ? "success" : "error",
      });

      if (status === "connected") {
        setOpenModal(false);
        void queryClient.invalidateQueries({ queryKey: ["stores"] });
        void queryClient.invalidateQueries({ queryKey: ["userInfo"] });
      } else {
        setOpenModal(true);
      }

      params.delete("shopify");
      params.delete("message");
      shouldReplaceUrl = true;
    }

    if (params.has("shop") && !params.has("shopifyInstall") && !params.has("shopify")) {
      params.delete("shop");
      shouldReplaceUrl = true;
    }

    if (shouldReplaceUrl) {
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true },
      );
    }
  }, [location.pathname, location.search, navigate, queryClient]);

  const validateFields = () => {
    const errors: typeof inputErrors = {
      storeUrl: "",
    };

    const normalizedStoreUrl = normalizeShopifyStoreUrl(shopifyDetails.storeUrl);

    if (!normalizedStoreUrl) {
      errors.storeUrl = "Store URL is required";
    } else if (
      !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(normalizedStoreUrl)
    ) {
      errors.storeUrl =
        "Enter a valid Shopify URL (e.g., mystore.myshopify.com)";
    }

    setInputErrors(errors);
    return Object.values(errors).every((val) => val === "");
  };
  const handleConnect = () => {
    if (!validateFields()) return;

    const shop = normalizeShopifyStoreUrl(shopifyDetails.storeUrl);

    startOAuth(
      {
        shop,
        returnTo: "/channels/connected",
      },
      {
        onSuccess: (data) => {
          const authUrl = data?.authUrl || data?.data?.authUrl;
          if (!authUrl) {
            toast.open({
              message: "Shopify authorization URL was not returned.",
              severity: "error",
            });
            return;
          }
          window.location.assign(authUrl);
        },
        onError: (error: any) => {
          const message =
            error?.response?.data?.error ||
            error?.response?.data?.message ||
            "Unable to start Shopify authorization";
          console.error("Error starting Shopify OAuth:", message);
          toast.open({
            message,
            severity: "error",
          });
        },
      },
    );
  };

  const isConnected: boolean = userData?.salesChannels?.shopify;

  return (
    <>
      <Card
        variant="outlined"
        sx={{
          bgcolor: "transparent",
          borderColor: "rgba(255,255,255,0.1)",
          color: "inherit",
          height: "100%",
          width: fullWidth ? "100%" : "auto",

          display: "flex",
          flexDirection: "column",
        }}
      >
        <CardContent sx={{ textAlign: "center", flexGrow: 1 }}>
          <Box display="flex" justifyContent="center" mb={1}>
            <SiShopify size={28} />
          </Box>
          <Typography fontWeight={600}>Shopify</Typography>
        </CardContent>
        <CardActions sx={{ justifyContent: "center", pb: 2 }}>
          <Button
            size="small"
            variant={"contained"}
            color={isConnected && forOnboarding ? "success" : "inherit"}
            onClick={() => setOpenModal(true)}
            fullWidth={isMobile}
          >
            {forOnboarding && isConnected ? "Connected" : "Connect"}
          </Button>
        </CardActions>
      </Card>

      <ShopifyConnectionModal
        handleConnect={handleConnect}
        inputErrors={inputErrors as ShopifyForm}
        integrating={integrating}
        openModal={openModal}
        onSetOpen={() => setOpenModal(false)}
        setShopifyDetails={setShopifyDetails}
        shopifyDetails={shopifyDetails}
        forOnboarding={forOnboarding}
      />
    </>
  );
}
