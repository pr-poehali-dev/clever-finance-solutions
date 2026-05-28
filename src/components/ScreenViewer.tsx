import { useState, useEffect, useRef, useCallback } from "react";
import { Monitor, Users, X, Maximize2, Minimize2, Volume2, VolumeX, Eye } from "lucide-react";

const SIGNAL_URL = "https://functions.poehali.dev/5f7bfb3f-7664-4e1e-aa94-20af798645a7";
const ICE_CFG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

interface Props {
  channelId: number;
  channelName: string;
  authUser: { user_id: number; display_name: string; avatar_color: string };
  onClose: () => void;
}

interface RemoteStream {
  userId: number;
  stream: MediaStream;
  isScreen: boolean;
  label: string;
}

// ── Тайл стрима ──────────────────────────────────────────────────────────────
function StreamTile({
  item, focused, onFocus,
}: {
  item: RemoteStream;
  focused: boolean;
  onFocus: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = item.stream;
  }, [item.stream]);

  const hasVideo = item.stream.getVideoTracks().some(t => t.readyState === "live" && t.enabled);

  return (
    <div
      onClick={onFocus}
      className={`relative bg-[#0d0f10] rounded-xl overflow-hidden border transition-all cursor-pointer group
        ${focused ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-[#2a2d31] hover:border-[#4a7c4a]/60"}
        ${fs ? "fixed inset-4 z-50 rounded-2xl" : ""}
      `}
    >
      {hasVideo ? (
        <video
          ref={ref}
          autoPlay playsInline
          className={`w-full h-full ${item.isScreen ? "object-contain bg-black" : "object-cover"}`}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full py-8 gap-3">
          <div className="w-14 h-14 rounded-full bg-[#35373c] flex items-center justify-center text-2xl font-bold text-white">
            {item.label[0].toUpperCase()}
          </div>
          <span className="text-[#5a7a5a] text-xs">Только аудио</span>
        </div>
      )}

      {/* Оверлей */}
      <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2">
        {item.isScreen && <Monitor className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
        <span className="text-white text-xs font-semibold truncate flex-1">{item.label}</span>
        <button
          onClick={e => { e.stopPropagation(); setFs(f => !f); }}
          className="opacity-0 group-hover:opacity-100 text-white/60 hover:text-white transition-all"
        >
          {fs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {item.isScreen && (
        <div className="absolute top-2 right-2 bg-blue-600/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
          <Monitor className="w-3 h-3" /> Экран
        </div>
      )}
      {focused && (
        <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-xs px-2 py-0.5 rounded-full font-semibold">Главный</div>
      )}

      {/* Закрыть фуллскрин */}
      {fs && <div className="absolute inset-0 -z-10" onClick={() => setFs(false)} />}
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────
export default function ScreenViewer({ channelId, channelName, authUser, onClose }: Props) {
  const [streams, setStreams] = useState<RemoteStream[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [status, setStatus] = useState("Подключение...");

  const peerConnsRef = useRef<Record<number, RTCPeerConnection>>({});
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSigRef   = useRef(0);
  // Уникальный viewer ID — отрицательный чтобы не конфликтовать с реальными user_id
  const viewerId = authUser.user_id * -1 - 99999;
  const roomId   = `voice_${channelId}`;

  const addStream = useCallback((userId: number, stream: MediaStream) => {
    const isScr = stream.getVideoTracks().some(t =>
      t.label.toLowerCase().includes("screen") ||
      t.label.toLowerCase().includes("display") ||
      t.label.toLowerCase().includes("window") ||
      t.label.toLowerCase().includes("entire")
    );
    const key = `${userId}-${isScr ? "screen" : "cam"}`;
    setStreams(prev => {
      const exists = prev.find(s => s.userId === userId && s.isScreen === isScr);
      const item: RemoteStream = { userId, stream, isScreen: isScr, label: `Участник ${userId}` };
      if (exists) return prev.map(s => s.userId === userId && s.isScreen === isScr ? item : s);
      return [...prev, item];
    });
    // Авто-фокус на экранную трансляцию
    if (isScr) setFocusedId(key);
  }, []);

  const createPeer = useCallback((targetId: number) => {
    const existing = peerConnsRef.current[targetId];
    if (existing && !["closed","failed","disconnected"].includes(existing.connectionState)) return existing;

    const pc = new RTCPeerConnection(ICE_CFG);
    peerConnsRef.current[targetId] = pc;

    // Зритель — только получаем, ничего не отправляем
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = ev => {
      const rs = ev.streams[0];
      if (rs) addStream(targetId, rs);
    };

    pc.onicecandidate = async ev2 => {
      if (!ev2.candidate) return;
      await fetch(SIGNAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", room_id: roomId, sender_id: viewerId, target_id: targetId, signal_type: "ice", payload: ev2.candidate }),
      });
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected","failed","closed"].includes(pc.connectionState)) {
        setStreams(prev => prev.filter(s => s.userId !== targetId));
        delete peerConnsRef.current[targetId];
      }
    };

    // Зритель инициирует offer
    pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then(offer => {
      pc.setLocalDescription(offer);
      fetch(SIGNAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", room_id: roomId, sender_id: viewerId, target_id: targetId, signal_type: "offer", payload: offer }),
      });
    });

    return pc;
  }, [viewerId, roomId, addStream]);

  const start = useCallback(async () => {
    setConnecting(true);
    setStatus("Подключение к каналу...");
    try {
      // Входим в комнату как зритель
      await fetch(SIGNAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", room_id: roomId, sender_id: viewerId }),
      });

      setConnected(true);
      setStatus("Ожидание трансляций...");

      lastSigRef.current = 0;
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${SIGNAL_URL}?action=poll&room_id=${roomId}&user_id=${viewerId}&since_id=${lastSigRef.current}`);
          const sigs = await res.json();
          for (const s of sigs) {
            lastSigRef.current = Math.max(lastSigRef.current, s.id);

            if (s.signal_type === "join") {
              // Новый участник — предлагаем соединение
              createPeer(s.sender_id);
            } else if (s.signal_type === "offer") {
              const pc = createPeer(s.sender_id);
              await pc.setRemoteDescription(new RTCSessionDescription(s.payload));
              const ans = await pc.createAnswer();
              await pc.setLocalDescription(ans);
              await fetch(SIGNAL_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send", room_id: roomId, sender_id: viewerId, target_id: s.sender_id, signal_type: "answer", payload: ans }),
              });
            } else if (s.signal_type === "answer") {
              const pc = peerConnsRef.current[s.sender_id];
              if (pc && pc.signalingState !== "stable") await pc.setRemoteDescription(new RTCSessionDescription(s.payload));
            } else if (s.signal_type === "ice") {
              const pc = peerConnsRef.current[s.sender_id];
              if (pc) await pc.addIceCandidate(new RTCIceCandidate(s.payload)).catch(() => {});
            } else if (s.signal_type === "leave") {
              setStreams(prev => prev.filter(s2 => s2.userId !== s.sender_id));
              peerConnsRef.current[s.sender_id]?.close();
              delete peerConnsRef.current[s.sender_id];
            }
          }

          if (streams.length > 0) setStatus(`${streams.length} участн. в эфире`);
        } catch { /* сеть */ }
      }, 1500);
    } catch {
      setStatus("Ошибка подключения");
    }
    setConnecting(false);
  }, [viewerId, roomId, createPeer, streams.length]);

  useEffect(() => { start(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const handleClose = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    Object.values(peerConnsRef.current).forEach(pc => pc.close());
    await fetch(SIGNAL_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", room_id: roomId, sender_id: viewerId }),
    }).catch(() => {});
    onClose();
  };

  // ESC для закрытия
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const screenStreams = streams.filter(s => s.isScreen);
  const focused = focusedId ? streams.find(s => `${s.userId}-${s.isScreen ? "screen" : "cam"}` === focusedId) : null;
  const others = streams.filter(s => `${s.userId}-${s.isScreen ? "screen" : "cam"}` !== focusedId);

  return (
    <div className="flex flex-col h-full bg-[#1e2124]">

      {/* Заголовок */}
      <div className="h-12 bg-[#313338] border-b border-[#1e2124] flex items-center px-4 gap-3 flex-shrink-0">
        <Eye className="w-4 h-4 text-purple-400" />
        <span className="text-white font-semibold text-sm">{channelName}</span>
        <span className="text-purple-400 text-xs bg-purple-600/20 border border-purple-500/30 px-2 py-0.5 rounded-full">Режим просмотра</span>
        <div className="flex items-center gap-1 text-[#5a7a5a] text-xs">
          <Users className="w-3 h-3" />{streams.length}
        </div>
        {connecting && (
          <div className="flex items-center gap-2 text-[#5a7a5a] text-xs ml-2">
            <div className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
            {status}
          </div>
        )}
        {!connecting && (
          <div className="flex items-center gap-1.5 text-purple-400 text-xs ml-2">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />{status}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setMuted(m => !m)} title={muted ? "Включить звук" : "Заглушить"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${muted ? "bg-red-600/30 text-red-400 hover:bg-red-600/50" : "bg-[#35373c] text-[#8a9e8a] hover:text-white hover:bg-[#3d4044]"}`}>
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={handleClose} title="Закрыть"
            className="w-8 h-8 rounded-lg bg-[#35373c] hover:bg-red-600 text-[#8a9e8a] hover:text-white flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Контент */}
      {streams.length === 0 ? (
        /* Пусто — ждём */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[#5a7a5a]">
          <div className="w-20 h-20 rounded-full bg-[#2b2d31] flex items-center justify-center">
            <Monitor className="w-10 h-10 opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[#3a4a3a]">Нет активных трансляций</p>
            <p className="text-sm mt-1">Участники ещё не включили камеру или трансляцию экрана</p>
          </div>
          {screenStreams.length === 0 && connected && (
            <div className="flex items-center gap-2 text-xs text-[#4a5a4a] bg-[#1a2a1a] border border-[#2a3a2a] rounded-lg px-4 py-2">
              <div className="w-2 h-2 bg-[#4a7c4a] rounded-full animate-pulse" />
              Ожидание участников...
            </div>
          )}
        </div>
      ) : focused ? (
        /* Режим: один большой + миниатюры сбоку */
        <div className="flex-1 flex overflow-hidden gap-3 p-4">
          {/* Главный */}
          <div className="flex-1 min-w-0">
            <StreamTile item={focused} focused={true} onFocus={() => {}} />
          </div>
          {/* Боковая панель с остальными */}
          {others.length > 0 && (
            <div className="w-48 flex flex-col gap-2 overflow-y-auto flex-shrink-0">
              <div className="text-[#5a7a5a] text-xs font-bold uppercase tracking-wider mb-1">Участники</div>
              {others.map(s => {
                const key = `${s.userId}-${s.isScreen ? "screen" : "cam"}`;
                return (
                  <div key={key} className="aspect-video flex-shrink-0">
                    <StreamTile item={s} focused={false} onFocus={() => setFocusedId(key)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Сетка */
        <div className="flex-1 overflow-auto p-4">
          <div className={`grid gap-3 h-full ${
            streams.length === 1 ? "grid-cols-1" :
            streams.length === 2 ? "grid-cols-2" :
            streams.length <= 4 ? "grid-cols-2" : "grid-cols-3"
          }`} style={{ gridAutoRows: "minmax(180px, 1fr)" }}>
            {streams.map(s => {
              const key = `${s.userId}-${s.isScreen ? "screen" : "cam"}`;
              return (
                <StreamTile key={key} item={s} focused={false} onFocus={() => setFocusedId(key)} />
              );
            })}
          </div>
        </div>
      )}

      {/* Нижняя панель */}
      <div className="flex-shrink-0 bg-[#232428] border-t border-[#1e2124] px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-[#5a7a5a]">
          <Eye className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-purple-400">Только просмотр</span>
          <span className="text-[#3a3d42]">•</span>
          <span>{streams.length} {streams.length === 1 ? "стрим" : "стримов"}</span>
          {screenStreams.length > 0 && (
            <>
              <span className="text-[#3a3d42]">•</span>
              <span className="text-blue-400">{screenStreams.length} экран</span>
            </>
          )}
        </div>
        {/* Переключение между трансляциями экрана */}
        {screenStreams.length > 1 && (
          <div className="flex gap-1 ml-2">
            {screenStreams.map((s, i) => (
              <button
                key={`${s.userId}-screen`}
                onClick={() => setFocusedId(`${s.userId}-screen`)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  focusedId === `${s.userId}-screen`
                    ? "bg-blue-600 text-white"
                    : "bg-[#35373c] text-[#8a9e8a] hover:bg-[#3d4044] hover:text-white"
                }`}
              >
                <Monitor className="w-3 h-3 inline mr-1" />Экран {i + 1}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto">
          <button onClick={handleClose} className="flex items-center gap-2 px-4 py-2 bg-[#35373c] hover:bg-red-600 text-[#8a9e8a] hover:text-white rounded-lg text-xs font-semibold transition-colors">
            <X className="w-3.5 h-3.5" /> Выйти из просмотра
          </button>
        </div>
      </div>
    </div>
  );
}
