import { Navigate, type RouteObject } from 'react-router-dom'
import AdminShell from '../components/layout/AdminShell'
import AuthPage from '../pages/AuthPage'
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import AdminSessionListPage from '../pages/admin/AdminSessionListPage'
import AdminDatasetListPage from '../pages/admin/AdminDatasetListPage'
import AdminDatasetDetailPage from '../pages/admin/AdminDatasetDetailPage'
import AdminUserDetailPage from '../pages/admin/AdminUserDetailPage'
import AdminLabelCatalogPage from '../pages/admin/AdminLabelCatalogPage'
import AdminSkuStudioPage from '../pages/admin/AdminSkuStudioPage'
import AdminCallsPage from '../pages/admin/AdminCallsPage'
import AdminBillableUnitsPage from '../pages/admin/AdminBillableUnitsPage'
import AdminConsentsPage from '../pages/admin/AdminConsentsPage'
import AdminSkuCatalogPage from '../pages/admin/AdminSkuCatalogPage'
import AdminSkuComponentsPage from '../pages/admin/AdminSkuComponentsPage'
import AdminQualityTiersPage from '../pages/admin/AdminQualityTiersPage'
import AdminBuildWizardPage from '../pages/admin/AdminBuildWizardPage'
import AdminExportJobsPage from '../pages/admin/AdminExportJobsPage'
import AdminExportJobDetailPage from '../pages/admin/AdminExportJobDetailPage'
import AdminClientsPage from '../pages/admin/AdminClientsPage'
import AdminDeliveryProfilesPage from '../pages/admin/AdminDeliveryProfilesPage'
import AdminClientSkuMapPage from '../pages/admin/AdminClientSkuMapPage'
import AdminSettlementPage from '../pages/admin/AdminSettlementPage'
import AdminMetaStoragePage from '../pages/admin/AdminMetaStoragePage'
import AdminReviewQueuePage from '../pages/admin/AdminReviewQueuePage'
import AdminBalancesPage from '../pages/admin/AdminBalancesPage'
import AdminTransactionsPage from '../pages/admin/AdminTransactionsPage'
import AdminUtterancesPage from '../pages/admin/AdminUtterancesPage'
import AdminTrainingPage from '../pages/admin/AdminTrainingPage'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <Navigate to="/admin" replace />,
  },
  {
    path: '/auth',
    element: <AuthPage />,
  },
  {
    element: <AdminShell />,
    children: [
      { path: '/admin', element: <AdminDashboardPage /> },
      { path: '/admin/sessions', element: <AdminSessionListPage /> },
      { path: '/admin/studio', element: <AdminSkuStudioPage /> },
      // inventory
      { path: '/admin/calls', element: <AdminCallsPage /> },
      { path: '/admin/units', element: <AdminBillableUnitsPage /> },
      { path: '/admin/labels', element: <AdminLabelCatalogPage /> },
      { path: '/admin/consents', element: <AdminConsentsPage /> },
      { path: '/admin/meta-storage', element: <AdminMetaStoragePage /> },
      // catalog
      { path: '/admin/sku-catalog', element: <AdminSkuCatalogPage /> },
      { path: '/admin/sku-components', element: <AdminSkuComponentsPage /> },
      { path: '/admin/quality-tiers', element: <AdminQualityTiersPage /> },
      // clients
      { path: '/admin/clients', element: <AdminClientsPage /> },
      { path: '/admin/delivery-profiles', element: <AdminDeliveryProfilesPage /> },
      { path: '/admin/sku-rules', element: <AdminClientSkuMapPage /> },
      // build
      { path: '/admin/build', element: <AdminBuildWizardPage /> },
      { path: '/admin/jobs', element: <AdminExportJobsPage /> },
      { path: '/admin/jobs/:jobId', element: <AdminExportJobDetailPage /> },
      { path: '/admin/settlement', element: <AdminSettlementPage /> },
      { path: '/admin/datasets', element: <AdminDatasetListPage /> },
      { path: '/admin/datasets/:datasetId', element: <AdminDatasetDetailPage /> },
      { path: '/admin/training', element: <AdminTrainingPage /> },
      // BM v10 신규 — 검수 + 납품 흐름 + 정산
      { path: '/admin/review', element: <AdminReviewQueuePage /> },
      // /admin/delivery/new 폐기 (STAGE 13, 2026-05-14) — /admin/utterances 의 DeliveryDialog 로 단일화
      { path: '/admin/delivery/new', element: <Navigate to="/admin/utterances" replace /> },
      { path: '/admin/transactions', element: <AdminTransactionsPage /> },
      { path: '/admin/balances', element: <AdminBalancesPage /> },
      { path: '/admin/utterances', element: <AdminUtterancesPage /> },
      // detail
      { path: '/admin/users/:userId', element: <AdminUserDetailPage /> },
    ],
  },
]

export default routes
