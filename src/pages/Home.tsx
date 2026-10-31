
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { loadStore, saveStore } from "@/lib/store";
import { fetchStore } from "@/lib/storeCloud";
import { Card } from "@/components/ui/card";
import logo from "@/assets/RCESS.png";

// ─────────────────────────────────────────────────────────────────────────────
// RCESS COUNTDOWN PAGE
// Neon-console / blueprint grid / glass panels.
// Automatic countdown closure when the target date and time is reached.
// ─────────────────────────────────────────────────────────────────────────────

type Ticks = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function computeTicks(target: Date): Ticks {
  const diff = target.getTime() - Date.now();

  if (!Number.isFinite(diff) || diff <= 0) {
    return {
      days: "0",
      hours: "00",
      minutes: "00",
      seconds: "00",
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days),
    hours: pad2(hours),
    minutes: pad2(minutes),
    seconds: pad2(seconds),
  };
}

function Unit({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="relative flex-1 min-w-[150px]">
      <div className="rcess-unit" />

      <div className="relative z-10 h-full px-6 py-6">
        <div className="text-4xl md:text-5xl font-semibold tracking-tight tabular-nums text-white">
          {value}
        </div>

        <div className="mt-2 text-[11px] tracking-[0.32em] text-white/55">
          {label}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [, navigate] = useLocation();

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);

  // Prevent repeated countdown closure
  const closingRef = useRef(false);

  // Load application settings
  const [store, setStore] = useState(() => loadStore());
  // Closure is only judged once Supabase has answered; a stale local flag from a
  // previous visit must not lock the portal before the real settings arrive.
  const [settingsReady, setSettingsReady] = useState(false);

  // Supabase holds the real settings; localStorage only covers the first paint.
  useEffect(() => {
    let cancelled = false;

    fetchStore()
      .then((cloud) => {
        if (cancelled) return;
        setStore(cloud);
        saveStore(cloud);
      })
      .catch(() => {
        // Unreachable Supabase: keep showing this browser's cached settings.
      })
      .finally(() => {
        if (!cancelled) setSettingsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // SECRET LOGO ACCESS
  // Triple-click the logo to open the login page.
  // ─────────────────────────────────────────────────────────────────────────

  function onLogoClick() {
    clickCountRef.current += 1;

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = window.setTimeout(() => {
      clickCountRef.current = 0;
      clickTimerRef.current = null;
    }, 700);

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;

      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      navigate("/login");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SYNCHRONIZE SETTINGS BETWEEN TABS
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "rcess.portal.store.v1") {
        setStore(loadStore());
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // COUNTDOWN TARGET
  // ─────────────────────────────────────────────────────────────────────────

  const target = useMemo(
    () => new Date(store.settings.countdownIso),
    [store.settings.countdownIso]
  );

  const [ticks, setTicks] = useState<Ticks>(() =>
    computeTicks(target)
  );

  // ─────────────────────────────────────────────────────────────────────────
  // AUTOMATIC COUNTDOWN CLOSURE
  //
  // When the target time is reached:
  // 1. Display 0 days, 00 hours, 00 minutes, 00 seconds.
  // 2. Set countdownClosed to true in localStorage.
  // 3. Redirect to /login.
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Hold the closure decision until Supabase has answered.
    if (!settingsReady) return;

    // If an administrator has already closed the countdown,
    // redirect immediately to the login page.
    if (store.settings.countdownClosed) {
      navigate("/login");
      return;
    }

    closingRef.current = false;

    const closeCountdown = () => {
      if (closingRef.current) return;

      closingRef.current = true;

      // Show zero before redirecting.
      setTicks({
        days: "0",
        hours: "00",
        minutes: "00",
        seconds: "00",
      });

      // Persist the closed state.
      try {
        const storageKey = "rcess.portal.store.v1";
        const raw = localStorage.getItem(storageKey);

        if (raw !== null) {
          const saved = JSON.parse(raw);

          saved.settings = {
            ...saved.settings,
            countdownClosed: true,
          };

          localStorage.setItem(
            storageKey,
            JSON.stringify(saved)
          );
        } else {
          console.error(
            "Countdown settings were not found in localStorage."
          );
        }
      } catch (error) {
        console.error(
          "Failed to save countdown closure:",
          error
        );
      }

      // Redirect to the login page.
      navigate("/login");
    };

    const updateCountdown = () => {
      const remaining = target.getTime() - Date.now();

      // Invalid countdown date: stop displaying a running countdown.
      if (!Number.isFinite(target.getTime())) {
        setTicks({
          days: "0",
          hours: "00",
          minutes: "00",
          seconds: "00",
        });
        return;
      }

      // Automatically close when the target time is reached.
      if (remaining <= 0) {
        closeCountdown();
        return;
      }

      setTicks(computeTicks(target));
    };

    // Check immediately when the component mounts.
    updateCountdown();

    // Keep the countdown updated.
    const intervalId = window.setInterval(
      updateCountdown,
      250
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    navigate,
    settingsReady,
    store.settings.countdownClosed,
    target,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE UI
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#030530] text-white"
      style={{ backgroundColor: "#030530" }}
    >
      {/* Same solid background as the Login page */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[#030530]"
        aria-hidden="true"
      />

      {/* Same background effects as the Login page */}
      <div
        className="rcess-grid pointer-events-none"
        aria-hidden="true"
      />

      <div
        className="rcess-vignette pointer-events-none"
        aria-hidden="true"
      />

      <div
        className="rcess-scanlines pointer-events-none"
        aria-hidden="true"
      />

      <div
        className="rcess-cornerglow pointer-events-none"
        aria-hidden="true"
      />

      {/* Existing countdown page content — unchanged */}
      <div className="relative z-10 mx-auto w-full max-w-[1250px] px-4 sm:px-6 md:px-10 py-8 sm:py-10 md:py-12">
        {/* Top header */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="rcess-logoWrap">
              <button
                type="button"
                onClick={onLogoClick}
                className="group block"
                aria-label="Logo (triple-click for login)"
              >
                <img
                  src={logo}
                  alt="RCESS organization logo"
                  className="h-30 w-30 rounded-full bg-white object-contain p-1 transition-transform duration-200 group-active:scale-[0.98]"
                />
              </button>
            </div>

            <div>
              <div className="text-[11px] tracking-[0.45em] text-cyan-300/80">
                PARSU • RCESS
              </div>

              <div className="mt-1 text-3xl font-semibold tracking-tight">
                RCESS
              </div>

              <div className="mt-0.5 text-sm text-white/55">
                Regional Civil Engineering Students Summit
              </div>
            </div>
          </div>

          <div className="hidden sm:block text-right">
            <div className="text-[11px] tracking-[0.45em] text-orange-200/80">
              COUNTDOWN • GENERAL ACCESS
            </div>
          </div>
        </div>

        {/* Main countdown panel */}
        <div className="mt-8 md:mt-10">
          <Card className="rcess-panel p-0">
            <div className="p-6 md:p-7">
              <div className="rcess-subbar">
                <div className="text-sm font-medium">
                  Coming Soon
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 md:p-5">
                <div className="flex flex-col md:flex-row gap-4">
                  <Unit
                    value={ticks.days}
                    label="DAYS"
                  />

                  <Unit
                    value={ticks.hours}
                    label="HOURS"
                  />

                  <Unit
                    value={ticks.minutes}
                    label="MINUTES"
                  />

                  <Unit
                    value={ticks.seconds}
                    label="SECONDS"
                  />
                </div>
              </div>
            </div>

            {/* Decorative right tab */}
            <div
              className="rcess-tab"
              aria-hidden="true"
            />
          </Card>
        </div>

        {/* Admin tip */}
        
      </div>
    </div>
  );
}
