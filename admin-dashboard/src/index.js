/*!

=========================================================
* Purity UI Dashboard - v1.0.1
=========================================================

* Product Page: https://www.creative-tim.com/product/purity-ui-dashboard
* Copyright 2021 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/purity-ui-dashboard/blob/master/LICENSE.md)

* Design by Creative Tim & Coded by Simmmple

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import { createRoot } from 'react-dom/client'

import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminAppErrorBoundary from 'components/ErrorBoundary/AdminAppErrorBoundary'
import AdminLayout from 'layouts/Admin.js'
import AuthLayout from 'layouts/Auth.js'
import RTLLayout from 'layouts/RTL.js'
import { installAdminRuntimeRecovery } from 'utils/adminRuntimeRecovery'
import './index.css'

installAdminRuntimeRecovery()

const queryClient = new QueryClient()
const ReactQueryDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : require('@tanstack/react-query-devtools').ReactQueryDevtools

const root = createRoot(document.getElementById('root'))
root.render(
  <AdminAppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Switch>
          <Route path={`/auth`} component={AuthLayout} />
          <Route path={`/admin`} component={AdminLayout} />
          <Route path={`/rtl`} component={RTLLayout} />
          <Redirect from={`/`} to="/auth/signin" />
        </Switch>
      </BrowserRouter>

      {/* Keep devtools out of production bundles. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </AdminAppErrorBoundary>,
)
