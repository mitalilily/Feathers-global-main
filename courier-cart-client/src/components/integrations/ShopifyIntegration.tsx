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
import { SiShopify } from "react-icons/si";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStartShopifyOAuth } from "../../hooks/useIntegrations";
import { toast } from "../UI/Toast";
import { useAuth } from "../../context/auth/AuthContext";
import ShopifyConnectionModal from "./ShopifyConnectionModal";

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
  fromChannelList = false,
}: IShopifyIntegrationProps) {
  const { user: userData } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [openModal, setOpenModal] = useState<boolean>(false);
  const autoStartAttemptedRef = useRef(false);

  const [shopifyDetails, setShopifyDetails] = useState<ShopifyForm>({
    storeUrl: "",
    userId: "",
    status: "active",
    settings: {
      fulfillTrigger: "order_booked",
      customerNotifyOnFulfill: "do_not_notify",
      autoUpdateShipmentStatus: true,
      autoCancelOrders: true,
    },
  });

  const [inputErrors, setInputErrors] = useState<{
    storeUrl?: string;
  }>({
    storeUrl: undefined,
  });

  const { mutate: startShopifyOAuth, isPending: integrating } =
    useStartShopifyOAuth();

  const beginShopifyOAuth = useCallback(
    (shop: string, returnTo: string) => {
      startShopifyOAuth(
        { shop, returnTo },
        {
          onSuccess: (data) => {
            const authUrl = data?.authUrl || data?.data?.authUrl
            if (!authUrl) {
              toast.open({
                message: "Shopify authorization URL was not returned",
                severity: "error",
              });
              return
            }
            window.location.assign(authUrl)
          },
          onError: (error: any) => {
            const message =
              error?.response?.data?.error ||
              error?.response?.data?.message ||
              "Error starting Shopify connection";
            console.error("Error starting Shopify OAuth:", message);
            toast.open({
              message,
              severity: "error",
            });
          },
        }
      );
    },
    [startShopifyOAuth],
  )

  const validateFields = () => {
    const errors: typeof inputErrors = {
      storeUrl: "",
    };

    const normalizedStoreUrl = normalizeShopifyStoreUrl(shopifyDetails.storeUrl)

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

    const shop = normalizeShopifyStoreUrl(shopifyDetails.storeUrl)
    const returnTo = fromChannelList || forOnboarding ? "/channels/connected" : window.location.pathname
    beginShopifyOAuth(shop, returnTo)
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const isShopifyInstall = params.get('shopifyInstall') === '1'
    const shop = normalizeShopifyStoreUrl(params.get('shop') || '')

    if (!isShopifyInstall || autoStartAttemptedRef.current) return
    autoStartAttemptedRef.current = true

    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
      toast.open({
        message: 'Shopify did not provide a valid store domain. Open the connection from Shopify admin again.',
        severity: 'error',
      })
      params.delete('shopifyInstall')
      params.delete('shop')
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true },
      )
      return
    }

    setShopifyDetails((prev) => ({ ...prev, storeUrl: shop }))
    setOpenModal(true)
    beginShopifyOAuth(shop, '/channels/connected')
  }, [beginShopifyOAuth, location.pathname, location.search, navigate])

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
