// 파일 경로: src/features/fdc-trend/routes.jsx
import { Navigate } from "react-router-dom"
import { FdcTrendShell } from "./components/FdcTrendShell"
import { CommonalityAnomalyPage } from "./pages/CommonalityAnomalyPage"
import { FdcTrendPage } from "./pages/FdcTrendPage"
import { DefectSpiderPage } from "./pages/DefectSpiderPage"
import { L0SpiderHomePage } from "./pages/L0SpiderHomePage"
import { SpiderComingSoonPage } from "./pages/SpiderComingSoonPage"
import { SpiderFeaturePage } from "./pages/SpiderFeaturePage"
import { UserManualPage } from "./pages/UserManualPage"

const fdcTrendChildren = [
  {
    index: true,
    element: <L0SpiderHomePage />,
  },
  {
    path: "self-equipment",
    element: <FdcTrendPage />,
  },
  {
    path: "registration",
    element: <SpiderComingSoonPage appId="my-eqp-registration" />,
  },
  {
    path: "matching-anomaly",
    element: <CommonalityAnomalyPage />,
  },
  {
    path: "common-anomaly",
    element: <SpiderComingSoonPage appId="common-anomaly" />,
  },
  {
    path: "common-commonality-anomaly",
    element: <CommonalityAnomalyPage variant="commonCommonality" />,
  },
  {
    path: "manual",
    element: <UserManualPage />,
  },
  {
    path: "under-construction/defect-spider",
    element: <Navigate to="/defect-spider" replace />,
  },
  {
    path: "under-construction/:appId",
    element: <SpiderComingSoonPage />,
  },
  {
    path: "recipients",
    element: <SpiderComingSoonPage appId="my-eqp-registration" />,
  },
  {
    path: "defect-spider",
    element: <DefectSpiderPage />,
  },
  {
    path: "l1-spider",
    element: <SpiderFeaturePage type="l1" />,
  },
  {
    path: "l3-spider",
    element: <SpiderFeaturePage type="l3" />,
  },
]

export const fdcTrendRoutes = [
  {
    element: <FdcTrendShell />,
    children: fdcTrendChildren,
  },
  {
    path: "fdc_trend",
    element: <FdcTrendShell />,
    children: fdcTrendChildren,
  },
]
