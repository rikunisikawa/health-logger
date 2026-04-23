import { useEffect, useRef, useState } from "react";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Fab from "@mui/material/Fab";
import AuthGuard from "./components/AuthGuard";
import DashboardPage from "./components/DashboardPage";
import HealthForm from "./components/HealthForm";
import type { ToastVariant } from "./components/HealthForm";
import HistoryBrowser from "./components/HistoryBrowser";
import ItemConfigScreen from "./components/ItemConfigScreen";
import RecordHistory from "./components/RecordHistory";
import { exportRecords, getLatest } from "./api";
import { useAuth } from "./hooks/useAuth";
import { useItemConfig } from "./hooks/useItemConfig";
import { useOfflineQueue } from "./hooks/useOfflineQueue";
import { usePushNotification } from "./hooks/usePushNotification";
import type { LatestRecord } from "./types";

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string;

function AppContent() {
  const { token, signOut } = useAuth();
  const { flush } = useOfflineQueue(API_ENDPOINT);
  const { subscribed, subscribe, unsubscribe } = usePushNotification(token);
  const { configs, save } = useItemConfig(token);
  const [showSettings, setShowSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);
  const [historyTab, setHistoryTab] = useState<"recent" | "search">("recent");
  const [records, setRecords] = useState<LatestRecord[]>([]);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    variant: ToastVariant;
  }>({ show: false, message: "", variant: "success" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, variant: ToastVariant) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, variant });
    toastTimerRef.current = setTimeout(
      () => setToast((t) => ({ ...t, show: false })),
      3000,
    );
  };

  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setPage((p) => Math.min(p + 1, 2));
      if (diff < 0) setPage((p) => Math.max(p - 1, 0));
    }
  };

  useEffect(() => {
    if (!token) return;
    const handleOnline = () => flush(token).catch(() => {});
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [token, flush]);

  const handleExport = async () => {
    if (!token || exporting) return;
    setExporting(true);
    try {
      const { url, filename } = await exportRecords(token, "csv");
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } catch {
      showToast("エクスポートに失敗しました", "danger");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    getLatest(token, 10)
      .then((res) => setRecords(res.records))
      .catch(() => {});
  }, [token]);

  const handleRecordDeleted = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const formItems = configs
    .filter((c) => c.mode === "form")
    .sort((a, b) => a.order - b.order);
  const eventItems = configs
    .filter((c) => c.mode === "event")
    .sort((a, b) => a.order - b.order);
  const statusItems = configs
    .filter((c) => c.mode === "status")
    .sort((a, b) => a.order - b.order);

  const latestDailyRecord = records.find((r) => r.record_type === "daily");

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Toast (rendered outside transform container to avoid position:fixed containment) */}
      {toast.show && (
        <div
          className={`alert alert-${toast.variant} mb-0`}
          role="alert"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2000,
            borderRadius: 0,
            textAlign: "center",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Navbar */}
      <nav
        className="navbar navbar-expand navbar-light bg-light border-bottom"
        style={{ flexShrink: 0 }}
      >
        <div className="container">
          <span className="navbar-brand fw-bold text-success d-flex align-items-center gap-2">
            <img
              src="/icon-192.png"
              alt="Health Logger"
              width={28}
              height={28}
              style={{ borderRadius: "6px" }}
            />
            Health Logger
          </span>
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={handleExport}
              disabled={exporting}
              title="データをエクスポート（CSV）"
            >
              {exporting ? "⏳" : "⬇️"}
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowSettings(true)}
              title="記録項目の設定"
            >
              ⚙️
            </button>
            <button
              className={`btn btn-sm ${subscribed ? "btn-outline-warning" : "btn-outline-success"}`}
              onClick={subscribed ? unsubscribe : subscribe}
              title={subscribed ? "通知をオフ" : "毎日21時に通知を受け取る"}
            >
              {subscribed ? "🔔" : "🔕"}
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={signOut}
            >
              ログアウト
            </button>
          </div>
        </div>
      </nav>

      {/* Swipeable pages */}
      <div
        style={{ flex: 1, overflow: "hidden", position: "relative" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            display: "flex",
            width: "300%",
            height: "100%",
            transform: `translateX(-${page * 33.333}%)`,
            transition: "transform 0.3s ease",
          }}
        >
          {/* Page 0: 記録フォーム */}
          <div
            style={{
              width: "33.333%",
              height: "100%",
              overflowY: "auto",
              paddingBottom: "72px",
            }}
          >
            <HealthForm
              formItems={formItems}
              eventItems={eventItems}
              statusItems={statusItems}
              latestDailyRecord={latestDailyRecord}
              onToast={showToast}
            />
          </div>

          {/* Page 1: 履歴 */}
          <div
            style={{
              width: "33.333%",
              height: "100%",
              overflowY: "auto",
              paddingBottom: "72px",
            }}
          >
            <div className="container py-3" style={{ maxWidth: "540px" }}>
              <div className="btn-group w-100 mb-3" role="group">
                <button
                  className={`btn btn-sm ${historyTab === "recent" ? "btn-success" : "btn-outline-secondary"}`}
                  onClick={() => setHistoryTab("recent")}
                >
                  最近の記録
                </button>
                <button
                  className={`btn btn-sm ${historyTab === "search" ? "btn-success" : "btn-outline-secondary"}`}
                  onClick={() => setHistoryTab("search")}
                >
                  過去ログ検索
                </button>
              </div>
              {historyTab === "recent" ? (
                <RecordHistory
                  records={records}
                  onDeleted={handleRecordDeleted}
                />
              ) : (
                <HistoryBrowser />
              )}
            </div>
          </div>

          {/* Page 2: 分析 */}
          <div
            style={{
              width: "33.333%",
              height: "100%",
              overflowY: "auto",
              paddingBottom: "72px",
            }}
          >
            <DashboardPage onBack={() => setPage(0)} />
          </div>
        </div>
      </div>

      {/* FAB: 履歴・分析ページにいるときのみ表示 */}
      {page !== 0 && (
        <Fab
          color="success"
          aria-label="体調を記録する"
          onClick={() => setPage(0)}
          sx={{
            position: "fixed",
            bottom: 80,
            right: 16,
            zIndex: 1200,
            bgcolor: "#198754",
            "&:hover": { bgcolor: "#146c43" },
          }}
        >
          <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>📝</span>
        </Fab>
      )}

      {/* Bottom Navigation */}
      <BottomNavigation
        value={page}
        onChange={(_, newValue: number) => setPage(newValue)}
        showLabels
        sx={{
          flexShrink: 0,
          borderTop: "1px solid #dee2e6",
          bgcolor: "#fff",
          height: "64px",
          "& .MuiBottomNavigationAction-root": {
            color: "#6c757d",
            minWidth: 0,
            fontSize: "0.75rem",
          },
          "& .MuiBottomNavigationAction-root.Mui-selected": {
            color: "#198754",
          },
          "& .MuiBottomNavigationAction-label": {
            fontSize: "0.75rem",
          },
          "& .MuiBottomNavigationAction-label.Mui-selected": {
            fontSize: "0.75rem",
          },
        }}
      >
        <BottomNavigationAction
          label="記録"
          icon={<span style={{ fontSize: "1.4rem", lineHeight: 1 }}>📝</span>}
        />
        <BottomNavigationAction
          label="履歴"
          icon={<span style={{ fontSize: "1.4rem", lineHeight: 1 }}>📋</span>}
        />
        <BottomNavigationAction
          label="分析"
          icon={<span style={{ fontSize: "1.4rem", lineHeight: 1 }}>📊</span>}
        />
      </BottomNavigation>

      {/* Settings modal */}
      {showSettings && (
        <ItemConfigScreen
          configs={configs}
          onSave={save}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthGuard>
      <AppContent />
    </AuthGuard>
  );
}
