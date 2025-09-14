import {useEffect, useState, useRef} from "react";
import {motion} from "framer-motion";
import {Clock, Ticket} from "lucide-react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

/**
 * LandingTicketRealtime
 * ---------------------
 * Single-file React component (Tailwind-ready) that:
 * - récupère l'API publique de tadakir
 * - affiche l'événement (images, clubs, date)
 * - montre "tickets restants" et le synchronise en temps réel
 * - essaie WebSocket si `wsUrl` fourni, sinon retombe sur polling
 * - fournit un bouton "simuler achat" (optimistic UI)
 *
 * Usage:
 * <LandingTicketRealtime clubSlug="kacm" wsUrl={null} />
 *
 * Déps (installer si nécessaire):
 * react, react-dom, tailwindcss, framer-motion, lucide-react, recharts
 */

export default function LandingTicketRealtime({
                                                  clubSlug = "kacm",
                                                  pollingInterval = 10000, // ms
                                                  wsUrl = null, // ex: "wss://example.com/ws/tickets"
                                                  apiEndpoint = null, // optional custom API, default built from clubSlug
                                              }) {
    const apiUrl = apiEndpoint
        ? apiEndpoint
        : `https://tadakir.net/api/mobile/evenement?clubSlug=${clubSlug}`;

    const [event, setEvent] = useState(null);
    const [remaining, setRemaining] = useState(null);
    const [history, setHistory] = useState([]); // for charting
    const [connectedVia, setConnectedVia] = useState("none");
    const wsRef = useRef(null);
    const pollingRef = useRef(null);

    // helper: fetch event data from api
    async function fetchEvent() {
        try {
            const res = await fetch(apiUrl, {cache: "no-store"});
            if (!res.ok) throw new Error("fetch failed");
            const arr = await res.json();
            if (!Array.isArray(arr) || arr.length === 0) return;
            const e = arr[0];
            setEvent(e);

            // try to infer remaining tickets: use 'quantity' if present, else use 'evenementQuota'
            const rem = typeof e.quantity === "number" ? e.quantity : e.evenementQuota;
            setRemaining((prev) => (rem !== undefined ? rem : prev));
            pushHistoryPoint(rem);
        } catch (err) {
            console.error("fetchEvent error", err);
        }
    }

    // keep a short history for the chart (max 30 points)
    function pushHistoryPoint(value) {
        if (typeof value !== "number") return;
        setHistory((h) => {
            const next = [...h, {t: new Date().toLocaleTimeString(), v: value}];
            if (next.length > 30) next.shift();
            return next;
        });
    }

    // Try WebSocket, fallback to polling
    useEffect(() => {
        let mounted = true;

        async function start() {
            await fetchEvent();

            if (wsUrl && event === null) {
                // if wsUrl provided but we don't have event yet, wait once then try
            }

            // Attempt websocket only if wsUrl provided and event exists
            if (wsUrl && event) {
                try {
                    const full = `${wsUrl}?eventId=${encodeURIComponent(event.evenementId)}`;
                    wsRef.current = new WebSocket(full);

                    wsRef.current.onopen = () => {
                        console.log("WS open", full);
                        if (!mounted) return;
                        setConnectedVia("websocket");
                    };

                    wsRef.current.onmessage = (msg) => {
                        try {
                            const d = JSON.parse(msg.data);
                            // Expect message shape: { evenementId: 153, remaining: 29300 }
                            if (d && typeof d.remaining === "number") {
                                setRemaining(d.remaining);
                                pushHistoryPoint(d.remaining);
                            }
                        } catch (e) {
                            console.warn("WS msg parse failed", e);
                        }
                    };

                    wsRef.current.onclose = () => {
                        console.log("WS closed");
                        if (!mounted) return;
                        setConnectedVia("none");
                        // fallback to polling
                        startPolling();
                    };

                    wsRef.current.onerror = (e) => {
                        console.error("WS error", e);
                        wsRef.current && wsRef.current.close();
                    };

                    return; // don't start polling if ws in use
                } catch (err) {
                    console.warn("WS init failed, fallback to polling", err);
                    startPolling();
                }
            } else {
                startPolling();
            }
        }

        function startPolling() {
            if (pollingRef.current) return;
            setConnectedVia("polling");
            pollingRef.current = setInterval(fetchEvent, pollingInterval);
        }

        start();

        return () => {
            mounted = false;
            if (wsRef.current) {
                try {
                    wsRef.current.close();
                } catch (e) {
                }
            }
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsUrl, clubSlug, apiEndpoint, pollingInterval, event && event.evenementId]);

    // countdown timer (simple)
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    function getCountdown(dateStr) {
        if (!dateStr) return "--";
        const target = new Date(dateStr).getTime();
        const diff = Math.max(0, target - now);
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `${days}j ${hours}h ${minutes}m ${seconds}s`;
    }

    // optimistic purchase simulation
    function simulatePurchase(qty = 1) {
        if (typeof remaining !== "number") return;
        const next = Math.max(0, remaining - qty);
        setRemaining(next);
        pushHistoryPoint(next);

        // If you have a real purchase endpoint, send it here.
        // Example (commented):
        // fetch(`https://tadakir.net/api/purchase`, { method: 'POST', body: JSON.stringify({ eventId: event.evenementId, qty }) })
        //   .then(...) // update with real response
    }

    if (!event) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <div className="text-center">
                    <div className="mb-4 animate-pulse h-64 w-full max-w-2xl rounded-lg bg-gray-200"/>
                    <p className="mt-4 text-gray-700">Chargement de l'événement...</p>
                </div>
            </div>
        );
    }

    const banner = event.evenementImageSlider || event.evenementImage;
    const clubLogo = event.clubLogo;
    const visitorLogo = event.clubVisitorLogo;
    const dateStr = event.evenementDateEvent;

    return (
        <div className="min-h-screen bg-gray-50">
            <div
                className="relative bg-cover bg-center"
                style={{backgroundImage: `url(${banner})`}}
            >
                <div className="backdrop-brightness-50 bg-black/40">
                    <div className="max-w-6xl mx-auto px-6 py-14">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                            {/* Left: visual */}
                            <motion.div
                                initial={{opacity: 0, y: 20}}
                                animate={{opacity: 1, y: 0}}
                                transition={{duration: 0.6}}
                                className="col-span-1 md:col-span-2 flex gap-6 items-center"
                            >
                                <img
                                    src={event.evenementImage}
                                    alt={event.evenementNomFr}
                                    className="w-48 h-48 rounded-2xl object-cover shadow-2xl border-4 border-white"
                                    loading="lazy"
                                />
                                <div className="text-white">
                                    <h1 className="text-3xl md:text-4xl font-bold">
                                        {event.evenementNomFr}
                                    </h1>
                                    <p className="mt-2 text-sm opacity-90">{event.categorieEventNom}</p>

                                    <div className="mt-4 flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <Clock size={18}/>
                                            <div className="text-sm">{dateStr}</div>
                                        </div>

                                        <div className="px-3 py-1 rounded-md bg-white/10 text-sm">
                                            {getCountdown(dateStr)}
                                        </div>

                                        <div className="ml-2 px-3 py-1 rounded-md bg-white/10 text-sm">
                                            Mode ticket: {event.evenementTicketMode === 1 ? "Billet" : "Autre"}
                                        </div>
                                    </div>

                                    <div className="mt-6 flex items-center gap-6">
                                        <div className="flex items-center gap-3">
                                            <img src={clubLogo} alt={event.clubNomFr} className="w-10 h-10"/>
                                            <div className="text-sm">{event.clubNomFr}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <img src={visitorLogo} alt={event.clubVisitorNomFr} className="w-10 h-10"/>
                                            <div className="text-sm">{event.clubVisitorNomFr}</div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Right: ticket panel */}
                            <motion.div
                                initial={{opacity: 0, y: 10}}
                                animate={{opacity: 1, y: 0}}
                                transition={{duration: 0.6, delay: 0.1}}
                                className="col-span-1 bg-white/95 rounded-3xl p-6 shadow-xl"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs uppercase text-gray-500">Tickets restants</div>
                                        <div className="flex items-baseline gap-3">
                                            <div className="text-4xl font-extrabold">
                                                {typeof remaining === "number" ? remaining : "--"}
                                            </div>
                                            <div className="text-sm text-gray-500">Places</div>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className="text-xs text-gray-400">Prix min</div>
                                        <div className="font-semibold">{event.evenementMinPrix} MAD</div>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                                        {/* If you had total capacity, compute percent; we'll approximate with a moving range */}
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all"
                                            style={{width: `${Math.min(100, (history.length ? (history[history.length - 1].v / (event.quantity || 1) * 100) : 50))}%`}}
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 text-xs text-gray-500">Sync: {connectedVia}</div>

                                <div className="mt-6 h-40">
                                    <h3 className="text-sm font-medium mb-2">Tendance tickets (dernières mesures)</h3>
                                    <ResponsiveContainer width="100%" height={110}>
                                        <LineChart data={history}>
                                            <XAxis dataKey="t" hide/>
                                            <YAxis hide/>
                                            <Tooltip/>
                                            <Line type="monotone" dataKey="v" stroke="#4f46e5" strokeWidth={2}
                                                  dot={false}/>
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                </div>
            </div>
        </div>
    );
}
