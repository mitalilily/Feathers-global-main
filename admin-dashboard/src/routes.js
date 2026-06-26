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
import { FaMoneyBill } from 'react-icons/fa'
import { MdAccountBalanceWallet } from 'react-icons/md'
import { RiScales3Line } from 'react-icons/ri'

// Components
import { lazy, Suspense } from 'react'
import { BsCreditCard2Back } from 'react-icons/bs'
import { CiCalculator1 } from 'react-icons/ci'
import { IoLocation } from 'react-icons/io5'
import { MdGavel } from 'react-icons/md'
import { AdminRoute } from 'views/Auth/AdminRoute'
import SignIn from 'views/Auth/SignIn'

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
const AdminDisputeManagement = lazy(() => import('views/WeightReconciliation/AdminDisputeManagement'))
const AdminWeightReconciliationDashboard = lazy(() =>
  import('views/WeightReconciliation/AdminWeightReconciliationDashboard'),
)
const ZoneMappingsPage = lazy(() => import('views/Zones/ZoneMappingsPage'))
const B2BPricingManagement = lazy(() => import('views/Pricing/B2BPricingManagement'))
const B2CPricingManagement = lazy(() => import('views/Pricing/B2CPricingManagement'))
const HolidayManagement = lazy(() => import('views/B2B/HolidayManagement'))

// ------------------ ROUTES ------------------

const dashRoutes = [
  // ========== DASHBOARD ==========
  // Dashboard (home page)
  {
    path: '/dashboard',
    name: 'Dashboard',
    icon: <IconDashboard size={20} />,
    component: () => (
      <AdminRoute>
        <Dashboard />
      </AdminRoute>
    ),
    layout: '/admin',
  },

  // ========== CORE OPERATIONS ==========
  // Orders (most frequently used)
  {
    path: '/orders',
    name: 'Orders',
    icon: <IconPackageExport />,
    component: () => (
      <AdminRoute>
        <Orders />
      </AdminRoute>
    ),
    layout: '/admin',
  },

  // Operations (NDR, RTO)
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
        component: () => (
          <AdminRoute>
            <AdminNdr />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/ops/rto',
        name: 'RTO',
        icon: <IconArrowBackUp />,
        component: () => (
          <AdminRoute>
            <AdminRto />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      // Pickups UI removed; cancellation is available from Orders or API
    ],
  },

  // ========== USER & BUSINESS MANAGEMENT ==========
  // Users Management
  {
    path: '/users-management/:id',
    name: 'User Details',
    component: () => (
      <AdminRoute>
        <UserDetails />
      </AdminRoute>
    ),
    layout: '/admin',
    show: false,
  },
  {
    path: '/users-management',
    name: 'Users Management',
    icon: <IconUser size={20} />,
    component: () => (
      <AdminRoute>
        <UsersManagementPage />
      </AdminRoute>
    ),
    layout: '/admin',
  },
  {
    path: '/notifications',
    name: 'Notifications',
    icon: <IconBell size={20} />,
    component: () => (
      <AdminRoute>
        <AdminNotificationsPage />
      </AdminRoute>
    ),
    layout: '/admin',
    show: false,
  },

  // Plan Management
  {
    path: '/plans',
    name: 'Plan Management',
    icon: <IconStar size={19} />,
    component: () => (
      <AdminRoute>
        <PlanManagement />
      </AdminRoute>
    ),
    layout: '/admin',
  },

  // ========== SHIPPING & LOGISTICS ==========
  // Shipping Management (Couriers + Rate Card + Serviceability + Zones)
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
        component: () => (
          <AdminRoute>
            <Couriers />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/courier-credentials',
        name: 'Courier Credentials',
        icon: <IconKey />,
        component: () => (
          <AdminRoute>
            <CourierCredentials />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/service-providers',
        name: 'Service Providers',
        icon: <IconTruck />,
        component: () => (
          <AdminRoute>
            <ServiceProviders />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/zones-mappings/:zoneId',
        name: 'Zone Mappings',
        component: () => (
          <AdminRoute>
            <ZoneMappingsPage />
          </AdminRoute>
        ),
        layout: '/admin',
        show: false,
      },
      {
        path: '/serviceability',
        name: 'Serviceability',
        icon: <IoLocation />,
        component: () => (
          <AdminRoute>
            <ServiceabilityPage />
          </AdminRoute>
        ),
        layout: '/admin',
      },

      {
        path: '/pricing/b2b',
        name: 'B2B',
        icon: <BsCreditCard2Back />,
        component: () => (
          <AdminRoute>
            <Suspense fallback={<div>Loading B2B...</div>}>
              <B2BPricingManagement />
            </Suspense>
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/pricing/b2c',
        name: 'B2C',
        icon: <BsCreditCard2Back />,
        component: () => (
          <AdminRoute>
            <Suspense fallback={<div>Loading B2C...</div>}>
              <B2CPricingManagement />
            </Suspense>
          </AdminRoute>
        ),
        layout: '/admin',
      },
    ],
  },

  // ========== FINANCIAL ==========
  // Billing (Invoices, COD Remittance, Wallet)
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
        component: () => (
          <AdminRoute>
            <AdminBillingInvoices />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/billing-preferences',
        name: 'Billing Preferences',
        icon: <IconAdjustments />,
        component: () => (
          <AdminRoute>
            <AdminBillingPreferences />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/cod-remittance',
        name: 'COD Remittance',
        icon: <MdAccountBalanceWallet />,
        component: () => (
          <AdminRoute>
            <AdminCodRemittancePage />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/wallet',
        name: 'Wallet',
        icon: <IconCoinRupee />,
        component: () => (
          <AdminRoute>
            <AdminWallets />
          </AdminRoute>
        ),
        layout: '/admin',
      },
    ],
  },

  // Reconciliation (Weight Discrepancies, Disputes)
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
        component: () => (
          <AdminRoute>
            <AdminWeightReconciliationDashboard />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/dispute-management',
        name: 'Dispute Management',
        icon: <MdGavel />,
        component: () => (
          <AdminRoute>
            <AdminDisputeManagement />
          </AdminRoute>
        ),
        layout: '/admin',
      },
    ],
  },

  // ========== TOOLS & UTILITIES ==========
  // Tools (Rate Calculator, Order Tracking)
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
        component: () => (
          <AdminRoute>
            <RateCalculatorPage />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/order-tracking',
        name: 'Order Tracking',
        icon: <IconTrack />,
        component: () => (
          <AdminRoute>
            <OrderTrackingPage />
          </AdminRoute>
        ),
        layout: '/admin',
      },
      {
        path: '/api-integration',
        name: 'API Integration',
        icon: <IconKey size={20} />,
        component: () => (
          <AdminRoute>
            <ApiIntegration />
          </AdminRoute>
        ),
        layout: '/admin',
      },
    ],
  },

  // ========== CONTENT & SUPPORT ==========
  // Blogs
  // {
  //   category: true,
  //   name: 'Blogs',
  //   state: 'blogsCollapse',
  //   icon: <FaBlog />,
  //   views: [
  //     {
  //       path: '/blogs',
  //       name: 'All Blogs',
  //       icon: <FaBloggerB />,
  //       component: () => (
  //         <AdminRoute>
  //           <Blogs />
  //         </AdminRoute>
  //       ),
  //       layout: '/admin',
  //     },
  //     {
  //       path: '/create-blog',
  //       name: 'Create Blog',
  //       icon: <MdCreate />,
  //       component: () => (
  //         <AdminRoute>
  //           <CreateBlog />
  //         </AdminRoute>
  //       ),
  //       layout: '/admin',
  //     },
  //     {
  //       path: '/create-blog/:id',
  //       name: 'Edit Blog',
  //       component: () => (
  //         <AdminRoute>
  //           <CreateBlog />
  //         </AdminRoute>
  //       ),
  //       layout: '/admin',
  //       show: false,
  //     },
  //   ],
  // },

  // Support
  // Place the more specific route first so it doesn't get shadowed by `/support`
  {
    path: '/about-us',
    name: 'About Us Page',
    icon: <IconInfoCircle />,
    component: () => (
      <AdminRoute>
        <AboutUsEditor />
      </AdminRoute>
    ),
    layout: '/admin',
  },

  {
    path: '/support',
    name: 'Support',
    icon: <IconHelpCircle />,
    component: () => (
      <AdminRoute>
        <AdminTicketDashboard />
      </AdminRoute>
    ),
    layout: '/admin',
  },

  // ========== SETTINGS ==========
  {
    path: '/settings/payment-options',
    name: 'Payment Options',
    icon: <IconSettings />,
    component: () => (
      <AdminRoute>
        <PaymentOptionsSettings />
      </AdminRoute>
    ),
    layout: '/admin',
  },
  {
    path: '/settings/change-password',
    name: 'Change Password',
    icon: <IconKey />,
    component: () => (
      <AdminRoute>
        <AdminChangePassword />
      </AdminRoute>
    ),
    layout: '/admin',
  },

  {
    path: '/developer',
    name: 'Developer',
    icon: <IconTools size={20} />,
    component: () => (
      <AdminRoute>
        <DeveloperLogs />
      </AdminRoute>
    ),
    layout: '/admin',
  },

  // ========== AUTH ==========
  // Auth (hidden from sidebar)
  {
    path: '/signin',
    name: 'Sign In',
    icon: <IconLogin2 />,
    component: SignIn,
    layout: '/auth',
    show: false,
  },
]

export default dashRoutes
