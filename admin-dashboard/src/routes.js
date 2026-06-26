import {
  IconAdjustments,
  IconAlertTriangle,
  IconArrowBackUp,
  IconBell,
  IconCoinRupee,
  IconDashboard,
  IconHelpCircle,
  IconInfoCircle,
  IconKey,
  IconLogin2,
  IconPackageExport,
  IconSettings,
  IconStar,
  IconTools,
  IconTrack,
  IconTruck,
  IconUser,
} from '@tabler/icons-react'
import { lazy, Suspense } from 'react'
import { BsCreditCard2Back } from 'react-icons/bs'
import { CiCalculator1 } from 'react-icons/ci'
import { FaMoneyBill } from 'react-icons/fa'
import { IoLocation } from 'react-icons/io5'
import { MdAccountBalanceWallet, MdGavel } from 'react-icons/md'
import { RiScales3Line } from 'react-icons/ri'
import { AdminRoute } from 'views/Auth/AdminRoute'

const SignIn = lazy(() => import('views/Auth/SignIn'))
const AdminBillingInvoices = lazy(() => import('views/Billing/AdminBillingInvoices'))
const AdminBillingPreferences = lazy(() => import('views/Billing/AdminBillingPreferences'))
const AdminCodRemittancePage = lazy(() => import('views/CodRemittance/AdminCodRemittancePage'))
const Couriers = lazy(() => import('views/Couriers/Couriers'))
const CourierCredentials = lazy(() => import('views/Couriers/CourierCredentials'))
const ServiceProviders = lazy(() => import('views/Couriers/ServiceProviders'))
const Dashboard = lazy(() => import('views/Dashboard/Dashboard'))
const DeveloperLogs = lazy(() => import('views/Developer/DeveloperLogs'))
const ApiIntegration = lazy(() => import('views/Integrations/ApiIntegration'))
const AdminNdr = lazy(() => import('views/Ops/AdminNdr'))
const AdminRto = lazy(() => import('views/Ops/AdminRto'))
const AdminNotificationsPage = lazy(() => import('views/Notifications/AdminNotificationsPage'))
const Orders = lazy(() => import('views/Orders/Orders'))
const PlanManagement = lazy(() => import('views/PlanManagement/PlanManagement'))
const B2BPricingManagement = lazy(() => import('views/Pricing/B2BPricingManagement'))
const B2CPricingManagement = lazy(() => import('views/Pricing/B2CPricingManagement'))
const ServiceabilityPage = lazy(() => import('views/Serviceability/ServiceabilityPage'))
const PaymentOptionsSettings = lazy(() => import('views/Settings/PaymentOptionsSettings'))
const AdminChangePassword = lazy(() => import('views/Settings/AdminChangePassword'))
const AboutUsEditor = lazy(() => import('views/Support/AboutUsEditor'))
const AdminTicketDashboard = lazy(() => import('views/Support/AdminTicketsDashboard'))
const OrderTrackingPage = lazy(() => import('views/Tools/OrderTrackingPage'))
const RateCalculatorPage = lazy(() => import('views/Tools/RateCalculatorPage'))
const UserDetails = lazy(() => import('views/UsersManagement/UserDetails'))
const UsersManagementPage = lazy(() => import('views/UsersManagement/UsersManagementPage'))
const AdminWallets = lazy(() => import('views/Wallets/AdminWallets'))
const AdminDisputeManagement = lazy(
  () => import('views/WeightReconciliation/AdminDisputeManagement'),
)
const AdminWeightReconciliationDashboard = lazy(
  () => import('views/WeightReconciliation/AdminWeightReconciliationDashboard'),
)
const ZoneMappingsPage = lazy(() => import('views/Zones/ZoneMappingsPage'))

const RouteFallback = ({ label = 'Loading...' }) => <div>{label}</div>

const withAdminRoute = (Component, label = 'Loading...') => () => (
  <AdminRoute>
    <Suspense fallback={<RouteFallback label={label} />}>
      <Component />
    </Suspense>
  </AdminRoute>
)

const withPublicRoute = (Component, label = 'Loading...') => () => (
  <Suspense fallback={<RouteFallback label={label} />}>
    <Component />
  </Suspense>
)

const dashRoutes = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    icon: <IconDashboard size={20} />,
    component: withAdminRoute(Dashboard, 'Loading dashboard...'),
    layout: '/admin',
  },
  {
    path: '/orders',
    name: 'Orders',
    icon: <IconPackageExport />,
    component: withAdminRoute(Orders, 'Loading orders...'),
    layout: '/admin',
  },
  {
    category: true,
    name: 'Operations',
    state: 'opsCollapse',
    icon: <IconSettings size={20} />,
    layout: '/admin',
    views: [
      {
        path: '/ops/ndr',
        name: 'NDR',
        icon: <IconAlertTriangle />,
        component: withAdminRoute(AdminNdr, 'Loading NDR...'),
        layout: '/admin',
      },
      {
        path: '/ops/rto',
        name: 'RTO',
        icon: <IconArrowBackUp />,
        component: withAdminRoute(AdminRto, 'Loading RTO...'),
        layout: '/admin',
      },
    ],
  },
  {
    path: '/users-management/:id',
    name: 'User Details',
    component: withAdminRoute(UserDetails, 'Loading user details...'),
    layout: '/admin',
    show: false,
  },
  {
    path: '/users-management',
    name: 'Users Management',
    icon: <IconUser size={20} />,
    component: withAdminRoute(UsersManagementPage, 'Loading users...'),
    layout: '/admin',
  },
  {
    path: '/notifications',
    name: 'Notifications',
    icon: <IconBell size={20} />,
    component: withAdminRoute(AdminNotificationsPage, 'Loading notifications...'),
    layout: '/admin',
    show: false,
  },
  {
    path: '/plans',
    name: 'Plan Management',
    icon: <IconStar size={19} />,
    component: withAdminRoute(PlanManagement, 'Loading plans...'),
    layout: '/admin',
  },
  {
    category: true,
    name: 'Shipping Management',
    state: 'shippingCollapse',
    icon: <IconTruck size={21} />,
    views: [
      {
        path: '/couriers',
        name: 'Couriers',
        icon: <IconTruck />,
        component: withAdminRoute(Couriers, 'Loading couriers...'),
        layout: '/admin',
      },
      {
        path: '/courier-credentials',
        name: 'Courier Credentials',
        icon: <IconKey />,
        component: withAdminRoute(CourierCredentials, 'Loading courier credentials...'),
        layout: '/admin',
      },
      {
        path: '/service-providers',
        name: 'Service Providers',
        icon: <IconTruck />,
        component: withAdminRoute(ServiceProviders, 'Loading service providers...'),
        layout: '/admin',
      },
      {
        path: '/zones-mappings/:zoneId',
        name: 'Zone Mappings',
        component: withAdminRoute(ZoneMappingsPage, 'Loading zone mappings...'),
        layout: '/admin',
        show: false,
      },
      {
        path: '/serviceability',
        name: 'Serviceability',
        icon: <IoLocation />,
        component: withAdminRoute(ServiceabilityPage, 'Loading serviceability...'),
        layout: '/admin',
      },
      {
        path: '/pricing/b2b',
        name: 'B2B',
        icon: <BsCreditCard2Back />,
        component: withAdminRoute(B2BPricingManagement, 'Loading B2B pricing...'),
        layout: '/admin',
      },
      {
        path: '/pricing/b2c',
        name: 'B2C',
        icon: <BsCreditCard2Back />,
        component: withAdminRoute(B2CPricingManagement, 'Loading B2C pricing...'),
        layout: '/admin',
      },
    ],
  },
  {
    category: true,
    path: '/billing',
    name: 'Billing',
    state: 'billingCollapse',
    icon: <FaMoneyBill />,
    layout: '/admin',
    views: [
      {
        path: '/billing-invoices',
        name: 'Invoices',
        icon: <MdAccountBalanceWallet />,
        component: withAdminRoute(AdminBillingInvoices, 'Loading invoices...'),
        layout: '/admin',
      },
      {
        path: '/billing-preferences',
        name: 'Billing Preferences',
        icon: <IconAdjustments />,
        component: withAdminRoute(AdminBillingPreferences, 'Loading billing preferences...'),
        layout: '/admin',
      },
      {
        path: '/cod-remittance',
        name: 'COD Remittance',
        icon: <MdAccountBalanceWallet />,
        component: withAdminRoute(AdminCodRemittancePage, 'Loading COD remittance...'),
        layout: '/admin',
      },
      {
        path: '/wallet',
        name: 'Wallet',
        icon: <IconCoinRupee />,
        component: withAdminRoute(AdminWallets, 'Loading wallet...'),
        layout: '/admin',
      },
    ],
  },
  {
    category: true,
    name: 'Reconciliation',
    state: 'reconciliationCollapse',
    icon: <RiScales3Line size={20} />,
    layout: '/admin',
    views: [
      {
        path: '/weight-reconciliation',
        name: 'Weight Discrepancies',
        icon: <RiScales3Line />,
        component: withAdminRoute(
          AdminWeightReconciliationDashboard,
          'Loading weight reconciliation...',
        ),
        layout: '/admin',
      },
      {
        path: '/dispute-management',
        name: 'Dispute Management',
        icon: <MdGavel />,
        component: withAdminRoute(AdminDisputeManagement, 'Loading disputes...'),
        layout: '/admin',
      },
    ],
  },
  {
    category: true,
    path: '/tools',
    name: 'Tools',
    state: 'toolsCollapse',
    icon: <IconTools size={20} />,
    layout: '/admin',
    views: [
      {
        path: '/rate-calculator',
        name: 'Rate Calculator',
        icon: <CiCalculator1 />,
        component: withAdminRoute(RateCalculatorPage, 'Loading rate calculator...'),
        layout: '/admin',
      },
      {
        path: '/order-tracking',
        name: 'Order Tracking',
        icon: <IconTrack />,
        component: withAdminRoute(OrderTrackingPage, 'Loading order tracking...'),
        layout: '/admin',
      },
      {
        path: '/api-integration',
        name: 'API Integration',
        icon: <IconKey size={20} />,
        component: withAdminRoute(ApiIntegration, 'Loading API integrations...'),
        layout: '/admin',
      },
    ],
  },
  {
    path: '/about-us',
    name: 'About Us Page',
    icon: <IconInfoCircle />,
    component: withAdminRoute(AboutUsEditor, 'Loading About Us editor...'),
    layout: '/admin',
  },
  {
    path: '/support',
    name: 'Support',
    icon: <IconHelpCircle />,
    component: withAdminRoute(AdminTicketDashboard, 'Loading support...'),
    layout: '/admin',
  },
  {
    path: '/settings/payment-options',
    name: 'Payment Options',
    icon: <IconSettings />,
    component: withAdminRoute(PaymentOptionsSettings, 'Loading payment options...'),
    layout: '/admin',
  },
  {
    path: '/settings/change-password',
    name: 'Change Password',
    icon: <IconKey />,
    component: withAdminRoute(AdminChangePassword, 'Loading password settings...'),
    layout: '/admin',
  },
  {
    path: '/developer',
    name: 'Developer',
    icon: <IconTools size={20} />,
    component: withAdminRoute(DeveloperLogs, 'Loading developer logs...'),
    layout: '/admin',
  },
  {
    path: '/signin',
    name: 'Sign In',
    icon: <IconLogin2 />,
    component: withPublicRoute(SignIn, 'Loading sign in...'),
    layout: '/auth',
    show: false,
  },
]

export default dashRoutes
