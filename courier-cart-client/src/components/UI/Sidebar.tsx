import type { JSX } from '@emotion/react/jsx-runtime'
import {
  alpha,
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { BiInfoCircle, BiListPlus } from 'react-icons/bi'
import { CgTrack } from 'react-icons/cg'
import { FaBalanceScaleLeft, FaBox } from 'react-icons/fa'
import { FaClipboardList as FaFileAlt, FaMoneyBill, FaToolbox, FaUser } from 'react-icons/fa6'
import { HiDocumentReport } from 'react-icons/hi'
import {
  MdDashboard,
  MdOutlineAccountBalanceWallet,
  MdOutlineAddBusiness,
  MdOutlineErrorOutline,
  MdOutlineHelp,
  MdOutlineHome,
  MdOutlineKeyboardReturn,
  MdOutlineRateReview,
  MdStorefront,
  MdOutlineWarningAmber,
} from 'react-icons/md'
import { RiSettings2Line } from 'react-icons/ri'
import { TbInvoice, TbReportAnalytics, TbTicket, TbTransactionRupee } from 'react-icons/tb'
import { NavLink, useLocation } from 'react-router-dom'
import { BRAND } from '../../config/brand'
import useEmployeePermissions from '../../hooks/User/useEmployeePermissions'
import { isActive } from '../../utils/functions'

export type Role = 'customer' | 'admin'

export interface SubItem {
  text: string
  path: string
  icon?: JSX.Element
}

export interface NavItem {
  text: string
  icon: JSX.Element
  path: string
  section: string
  roles: Role[]
  children?: SubItem[]
}

interface SidebarProps {
  role?: Role
  pinned?: boolean
  onPinChange?: (pinned: boolean) => void
}

const SIDEBAR_EXPANDED_WIDTH = 260
const SIDEBAR_COLLAPSED_WIDTH = 84
const ICON_SIZE_MD = 20 // Material Design
const ICON_SIZE_FA = 18 // Font Awesome (slightly smaller to match MD)
const ICON_SIZE_TB = 20 // Tabler
const ICON_SIZE_BI = 20 // Bootstrap Icons
const ICON_SIZE_CG = 20 // css.gg
const ICON_SIZE_HI = 20 // Heroicons
const ICON_SIZE_RI = 18 // Remix Icon
const BRAND_ORANGE = BRAND.colors.teal
const BRAND_ACCENT = BRAND.colors.orange
const BRAND_SURFACE = BRAND.colors.paper
const BRAND_INK = BRAND.colors.ink
const BRAND_BORDER = BRAND.colors.border
const LOGO_SRC = BRAND.mark

const navItems: NavItem[] = [
  {
    text: 'Overview',
    icon: <MdOutlineHome size={ICON_SIZE_MD} />,
    path: '/home',
    section: 'Overview',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Dashboard',
    icon: <MdDashboard size={ICON_SIZE_MD} />,
    path: '/dashboard',
    section: 'Overview',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Shipments',
    icon: <FaBox size={ICON_SIZE_FA} />,
    path: '/orders',
    section: 'Execution',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'All Shipments',
        path: '/orders/list',
        icon: <FaFileAlt size={ICON_SIZE_FA} />,
      },
      {
        text: 'B2C Orders',
        path: '/orders/b2c/list',
        icon: <FaUser size={ICON_SIZE_FA} />,
      },
      {
        text: 'B2B Orders',
        path: '/orders/b2b/list',
        icon: <MdOutlineAddBusiness size={ICON_SIZE_MD} />,
      },
      {
        text: 'Create Order',
        path: '/orders/create',
        icon: <BiListPlus size={ICON_SIZE_BI} />,
      },
    ],
  },
  {
    text: 'Exceptions',
    icon: <MdOutlineErrorOutline size={ICON_SIZE_MD} />,
    path: '/ops',
    section: 'Execution',
    roles: ['customer', 'admin'],
    children: [
      { text: 'NDR', path: '/ops/ndr', icon: <MdOutlineWarningAmber size={ICON_SIZE_MD} /> },
      {
        text: 'RTO',
        path: '/ops/rto',
        icon: <MdOutlineKeyboardReturn size={ICON_SIZE_MD} />,
      },
    ],
  },
  {
    text: 'Finance',
    icon: <FaMoneyBill size={ICON_SIZE_FA} />,
    path: '/billing',
    section: 'Finance',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Wallet Transactions',
        path: '/billing/wallet_transactions',
        icon: <TbTransactionRupee size={ICON_SIZE_TB} />,
      },
      {
        text: 'COD Settlements',
        path: '/cod-remittance',
        icon: <MdOutlineAccountBalanceWallet size={ICON_SIZE_MD} />,
      },
      {
        text: 'Invoices',
        path: '/billing/invoice_management',
        icon: <TbInvoice size={ICON_SIZE_TB} />,
      },
    ],
  },
  {
    text: 'Audits',
    icon: <FaBalanceScaleLeft size={ICON_SIZE_FA} />,
    path: '/reconciliation',
    section: 'Finance',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Weight Audit',
        path: '/reconciliation/weight',
        icon: <FaBalanceScaleLeft size={ICON_SIZE_FA} />,
      },
      {
        text: 'Audit Rules',
        path: '/reconciliation/weight/settings',
        icon: <RiSettings2Line size={ICON_SIZE_RI} />,
      },
    ],
  },
  {
    text: 'Utilities',
    icon: <FaToolbox size={ICON_SIZE_FA} />,
    path: '/tools',
    section: 'Toolkit',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Rate Chart',
        path: '/tools/rate_card',
        icon: <MdOutlineRateReview size={ICON_SIZE_MD} />,
      },
      {
        text: 'Rate Calculator',
        path: '/tools/rate_calculator',
        icon: <TbReportAnalytics size={ICON_SIZE_TB} />,
      },
      {
        text: 'Track Shipment',
        path: '/tools/order_tracking',
        icon: <CgTrack size={ICON_SIZE_CG} />,
      },
    ],
  },
  {
    text: 'Insights',
    icon: <HiDocumentReport size={ICON_SIZE_HI} />,
    path: '/reports',
    section: 'Toolkit',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Channels',
    icon: <MdStorefront size={ICON_SIZE_MD} />,
    path: '/channels',
    section: 'System',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Connected Channels',
        path: '/channels/connected',
        icon: <MdStorefront size={ICON_SIZE_MD} />,
      },
      {
        text: 'Connect Store',
        path: '/channels/channel_list',
        icon: <MdOutlineAddBusiness size={ICON_SIZE_MD} />,
      },
    ],
  },
  {
    text: 'Workspace',
    icon: <RiSettings2Line size={ICON_SIZE_RI} />,
    path: '/settings',
    section: 'System',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Support',
    icon: <MdOutlineHelp size={ICON_SIZE_MD} />,
    path: '/support',
    section: 'System',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Support Tickets',
        path: '/support/tickets',
        icon: <TbTicket size={ICON_SIZE_TB} />,
      },
      {
        text: `About ${BRAND.name}`,
        path: '/support/about_us',
        icon: <BiInfoCircle size={ICON_SIZE_BI} />,
      },
    ],
  },
]

export default function Sidebar({
  role = 'customer',
  pinned: initialPinned = false,
  // onPinChange,
}: SidebarProps) {
  const { pathname } = useLocation()
  const [pinned, setPinned] = useState(initialPinned)
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [hoveredItemText, setHoveredItemText] = useState<string | null>(null)
  const [expandedItemText, setExpandedItemText] = useState<string | null>(null)
  const { canViewWallet, canUseRateCalculator } = useEmployeePermissions()

  useEffect(() => {
    setPinned(initialPinned)
  }, [initialPinned])

  // const handlePinToggle = () => {
  //   const newPinned = !pinned
  //   setPinned(newPinned)
  //   onPinChange?.(newPinned)
  // }

  const sidebarWidth = pinned ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH
  const shouldShowExpanded = pinned

  const filteredItems = useMemo(() => {
    return navItems
      .filter((item) => item.roles.includes(role))
      .map((item) => {
        if (!item.children?.length) return item

        const children = item.children.filter((child) => {
          if (child.path === '/billing/wallet_transactions') return canViewWallet
          if (child.path === '/tools/rate_calculator') return canUseRateCalculator
          return true
        })

        if (!children.length) return null

        return { ...item, children }
      })
      .filter((item): item is NavItem => Boolean(item))
  }, [canUseRateCalculator, canViewWallet, role])

  const handlePopoverOpen = (event: React.MouseEvent<HTMLButtonElement>, itemText: string) => {
    setAnchorEl(event.currentTarget)
    setHoveredItemText(itemText)
  }

  const handlePopoverClose = () => {
    setAnchorEl(null)
    setHoveredItemText(null)
  }

  return (
    <Box
      sx={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        background: BRAND_SURFACE,
        color: BRAND_INK,
        borderRight: `1px solid ${BRAND_BORDER}`,
        boxShadow: '10px 0 30px rgba(4, 62, 69, 0.06)',
        zIndex: 1200,
        overflowY: 'auto',
        overflowX: 'hidden',
        transition:
          'width 300ms cubic-bezier(0.4, 0, 0.2, 1), min-width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent={shouldShowExpanded ? 'space-between' : 'center'}
        sx={{
          px: shouldShowExpanded ? 1.5 : 1,
          py: 1.5,
          borderBottom: `1px solid ${BRAND_BORDER}`,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Box
            component="img"
            src={LOGO_SRC}
            alt={BRAND.name}
            sx={{ width: '90%', height: '90%', objectFit: 'contain' }}
          />
        </Box>
        {shouldShowExpanded && (
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: BRAND_INK }}>
              {BRAND.name}
            </Typography>
          </Box>
        )}
      </Stack>

      <List
        sx={{
          flex: 1,
          px: 0.5,
          py: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {filteredItems.map(({ text, icon, path, children }) => {
          const hasChildren = Boolean(children?.length)
          const childActive = children?.some((child) => isActive(child.path, pathname))
          const isActive_ = isActive(path, pathname) || childActive

          return (
            <Box key={text}>
              <Tooltip title={shouldShowExpanded || hasChildren ? '' : text} placement="right">
                <ListItemButton
                  {...(!hasChildren && { component: NavLink, to: path })}
                  onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                    if (hasChildren) {
                      if (!shouldShowExpanded) {
                        // When collapsed, show popover
                        handlePopoverOpen(e as any, text)
                      } else {
                        // When expanded, toggle the expanded item
                        setExpandedItemText(expandedItemText === text ? null : text)
                      }
                    } else {
                      // Close popover when hovering over items without children
                      handlePopoverClose()
                      setExpandedItemText(null)
                    }
                  }}
                  onMouseLeave={() => {
                    // Close popover with delay to allow interaction
                    if (!shouldShowExpanded && hasChildren) {
                      setTimeout(() => {
                        // Only close if we're not hovering over the popover
                        if (!hoveredItemText) {
                          handlePopoverClose()
                        }
                      }, 200)
                    }
                  }}
                  sx={{
                    minHeight: 56,
                    px: shouldShowExpanded ? 1.5 : 0.75,
                    mb: 0.5,
                    borderRadius: 1.5,
                    justifyContent: shouldShowExpanded ? 'flex-start' : 'center',
                    background: isActive_ ? alpha(BRAND_ORANGE, 0.1) : 'transparent',
                    border: `1px solid ${isActive_ ? alpha(BRAND_ORANGE, 0.3) : alpha(BRAND_INK, 0.08)}`,
                    color: isActive_ ? BRAND_ORANGE : '#999999',
                    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      background: isActive_
                        ? `linear-gradient(135deg, ${alpha(BRAND_ORANGE, 0.08)} 0%, ${alpha(BRAND_ACCENT, 0.04)} 100%)`
                        : 'transparent',
                      opacity: 0,
                      transition: 'opacity 200ms ease',
                    },
                    '&:hover': {
                      background: isActive_ ? alpha(BRAND_ORANGE, 0.15) : alpha(BRAND_INK, 0.04),
                      borderColor: isActive_ ? alpha(BRAND_ORANGE, 0.4) : alpha(BRAND_INK, 0.15),
                      color: isActive_ ? BRAND_ORANGE : '#666666',
                      transform: 'translateY(-1px)',
                      boxShadow: `0 4px 12px ${alpha(BRAND_INK, 0.08)}`,
                      '&::before': {
                        opacity: 1,
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: shouldShowExpanded ? 40 : 0,
                      display: 'flex',
                      justifyContent: 'center',
                      color: '#1A1A1A',
                      fontSize: '1.5rem',
                    }}
                  >
                    {icon}
                  </ListItemIcon>
                  {shouldShowExpanded && (
                    <ListItemText
                      primary={text}
                      slotProps={{
                        primary: {
                          sx: {
                            fontSize: '0.875rem',
                            fontWeight: isActive_ ? 600 : 500,
                            color: 'inherit',
                          },
                        },
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
              {hasChildren && shouldShowExpanded && (
                <Collapse in={expandedItemText === text} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ pl: 2 }}>
                    {children?.map((child) => {
                      const childIsActive = isActive(child.path, pathname)
                      return (
                        <ListItemButton
                          key={child.path}
                          component={NavLink}
                          to={child.path}
                          sx={{
                            minHeight: 44,
                            px: 1.5,
                            mb: 0.25,
                            borderRadius: 1,
                            color: childIsActive ? BRAND_ORANGE : '#999999',
                            background: childIsActive ? alpha(BRAND_ORANGE, 0.08) : 'transparent',
                            border: `1px solid ${childIsActive ? alpha(BRAND_ORANGE, 0.2) : alpha(BRAND_INK, 0.08)}`,
                            fontSize: '0.85rem',
                            fontWeight: childIsActive ? 600 : 500,
                            '&:hover': {
                              background: childIsActive
                                ? alpha(BRAND_ORANGE, 0.12)
                                : alpha(BRAND_INK, 0.04),
                              borderColor: childIsActive
                                ? alpha(BRAND_ORANGE, 0.3)
                                : alpha(BRAND_INK, 0.12),
                              color: childIsActive ? BRAND_ORANGE : '#666666',
                            },
                          }}
                        >
                          <ListItemIcon
                            sx={{
                              minWidth: 32,
                              color: '#1A1A1A',
                              fontSize: '1rem',
                            }}
                          >
                            {child.icon}
                          </ListItemIcon>
                          <ListItemText primary={child.text} />
                        </ListItemButton>
                      )
                    })}
                  </List>
                </Collapse>
              )}
            </Box>
          )
        })}
      </List>

      {/* Custom Dropdown Menu for collapsed sidebar */}
      {hoveredItemText && anchorEl && !shouldShowExpanded && (
        <Box
          onMouseEnter={() => setHoveredItemText(hoveredItemText)}
          onMouseLeave={handlePopoverClose}
          sx={{
            position: 'fixed',
            zIndex: 1300,
            left: `${sidebarWidth + 8}px`,
            top: anchorEl.getBoundingClientRect().top,
            background: BRAND_SURFACE,
            border: `1px solid ${BRAND_BORDER}`,
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            minWidth: 220,
            animation: 'fadeInSlide 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            '@keyframes fadeInSlide': {
              from: {
                opacity: 0,
                transform: 'translateX(-8px)',
              },
              to: {
                opacity: 1,
                transform: 'translateX(0)',
              },
            },
          }}
        >
          <List sx={{ py: 1 }}>
            {filteredItems
              .find((item) => item.text === hoveredItemText)
              ?.children?.map((child) => {
                const active = isActive(child.path, pathname)
                return (
                  <ListItemButton
                    key={child.path}
                    component={NavLink}
                    to={child.path}
                    onClick={handlePopoverClose}
                    sx={{
                      px: 1.5,
                      py: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      background: active ? alpha(BRAND_ORANGE, 0.08) : 'transparent',
                      color: active ? BRAND_ORANGE : BRAND_INK,
                      transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                      borderRadius: 1,
                      position: 'relative',
                      overflow: 'hidden',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: active ? '3px' : '0px',
                        height: active ? '60%' : '0%',
                        background: BRAND_ORANGE,
                        borderRadius: '0 2px 2px 0',
                        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                      },
                      '&:hover': {
                        background: active ? alpha(BRAND_ORANGE, 0.15) : alpha(BRAND_INK, 0.06),
                        transform: 'translateX(4px)',
                        '&::before': {
                          height: '70%',
                        },
                      },
                    }}
                  >
                    {child.icon && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'inherit',
                          fontSize: '1.2rem',
                        }}
                      >
                        {child.icon}
                      </Box>
                    )}
                    <Typography variant="body2" sx={{ fontWeight: active ? 600 : 500 }}>
                      {child.text}
                    </Typography>
                  </ListItemButton>
                )
              })}
          </List>
        </Box>
      )}
    </Box>
  )
}
