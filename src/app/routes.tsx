import { Navigate, type RouteObject } from 'react-router-dom'
import AdminShell from '../components/layout/AdminShell'
import AuthPage from '../pages/AuthPage'
import AdminDatasetListPage from '../pages/admin/AdminDatasetListPage'
import AdminDatasetDetailPage from '../pages/admin/AdminDatasetDetailPage'
import AdminUserDetailPage from '../pages/admin/AdminUserDetailPage'
import AdminLabelCatalogPage from '../pages/admin/AdminLabelCatalogPage'
import AdminSkuStudioPage from '../pages/admin/AdminSkuStudioPage'
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
import AdminBalancesPage from '../pages/admin/AdminBalancesPage'
import AdminTransactionsPage from '../pages/admin/AdminTransactionsPage'
import AdminInventoryPage from '../pages/admin/AdminInventoryPage'
import AdminTrainingPage from '../pages/admin/AdminTrainingPage'
import AdminDeliveryPage from '../pages/admin/AdminDeliveryPage'
import AdminExportsPage from '../pages/admin/AdminExportsPage'
import AdminReviewQueueV2Page from '../pages/admin/AdminReviewQueueV2Page'

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
      { path: '/admin', element: <Navigate to="/admin/calls" replace /> },
      { path: '/admin/sessions', element: <Navigate to="/admin/calls" replace /> },
      { path: '/admin/studio', element: <AdminSkuStudioPage /> },
      // inventory
      { path: '/admin/calls', element: <AdminInventoryPage /> },
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
      { path: '/admin/delivery', element: <AdminDeliveryPage /> },
      { path: '/admin/exports', element: <AdminExportsPage /> },
      // BM v10 신규 — 검수 + 납품 흐름 + 정산
      // /admin/review 폐기 (2026-05-15) — /admin/utterances 에 통합
      { path: '/admin/review', element: <Navigate to="/admin/utterances" replace /> },
      // /admin/delivery/new 폐기 (STAGE 13, 2026-05-14) — /admin/utterances 의 DeliveryDialog 로 단일화
      { path: '/admin/delivery/new', element: <Navigate to="/admin/utterances" replace /> },
      { path: '/admin/transactions', element: <AdminTransactionsPage /> },
      { path: '/admin/balances', element: <AdminBalancesPage /> },
      { path: '/admin/utterances', element: <Navigate to="/admin/calls" replace /> },
      // 검수 패널 v2 (P1 prototype, 정본 design_review_panel_redesign_20260603.md)
      { path: '/admin/review-v2', element: <AdminReviewQueueV2Page /> },
      // detail
      { path: '/admin/users/:userId', element: <AdminUserDetailPage /> },
    ],
  },
]

export default routes
