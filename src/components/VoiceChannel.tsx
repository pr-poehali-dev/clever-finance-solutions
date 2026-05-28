import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  PhoneOff, Users, Volume2, VolumeX, X, Maximize2,
} from "lucide-react";

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
  onLeave: () => void;
}

interface Remote {
  userId: number;
  displayName: string;
  avatarColor: string;
  camStream: MediaStream | null;   // камера / аудио
  screenStream: MediaStream | null; // трансляция экрана
}

// ── Видео-тайл ────────────────────────────────────────────────────────────────
function VideoTile({
  stream, label, isLocal, isScreen, avatarName, avatarColor,
  onClick, clickable,
}: {
  stream: MediaStream | null;
  label: string;
  isLocal: boolean;
  isScreen: boolean;
  avatarName: string;
  avatarColor: string;
  onClick?: () => void;
  clickable?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream && stream.getVideoTracks().some(t => t.readyState === "live" && t.enabled);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={`relative bg-[#0d0f10] rounded-2xl overflow-hidden border border-[#2a2d31] flex items-center justify-center group transition-all
        ${clickable ? "cursor-pointer hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/10" : ""}
      `}
    >
      {hasVideo ? (
        <video
          ref={ref}
          autoPlay playsInline
          muted={isLocal}
          className={`w-full h-full ${isScreen ? "object-contain bg-black" : "object-cover"}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 select-none">
          <div
            className="rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-lg"
            style={{ width: 72, height: 72, backgroundColor: avatarColor }}
          >
            {avatarName?.[0]?.toUpperCase()}
          </div>
          <span className="text-[#5a7a5a] text-xs">{label}</span>
        </div>
      )}

      {/* Нижняя подпись */}
      <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2">
        {isScreen && <Monitor className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
        <span className="text-white text-xs font-semibold truncate flex-1">
          {isLocal ? `${label} (вы)` : label}
        </span>
        {clickable && hasVideo && (
          <Maximize2 className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors flex-shrink-0" />
        )}
      </div>

      {/* Бейджи */}
      {isLocal && (
        <div className="absolute top-2 left-2 bg-[#4a7c4a]/90 text-white text-xs px-2 py-0.5 rounded-full font-semibold">ВЫ</div>
      )}
      {isScreen && (
        <div className="absolute top-2 right-2 bg-blue-600/90 text-white text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
          <Monitor className="w-3 h-3" /> Экран
        </div>
      )}
    </div>
  );
}

// ── Модальный просмотр трансляции ─────────────────────────────────────────────
function ScreenModal({ stream, label, onClose }: { stream: MediaStream; label: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  // Закрыть по Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#1e2124] border-b border-[#2a2d31] flex-shrink-0">
        <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
          <Monitor className="w-4 h-4" />
          Трансляция экрана — {label}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[#5a7a5a] text-xs">ESC — закрыть</span>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#35373c] hover:bg-[#3d4044] flex items-center justify-center text-[#8a9e8a] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Видео */}
      <div className="flex-1 flex items-center justify-center p-4" onClick={onClose}>
        <video
          ref={ref}
          autoPlay playsInline
          className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
          onClick={e => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────
export default function VoiceChannel({ channelId, channelName, authUser, onLeave }: Props) {
  const [micOn, setMicOn]       = useState(true);
  const [camOn, setCamOn]       = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState("");

  // Свои стримы
  const micStreamRef    = useRef<MediaStream | null>(null);
  const camStreamRef    = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Что показываем в своём тайле
  const [localCamStream,    setLocalCamStream]    = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);

  // Удалённые участники
  const [remotes, setRemotes] = useState<Remote[]>([]);

  // Модальный просмотр
  const [watchingScreen, setWatchingScreen] = useState<{ stream: MediaStream; label: string } | null>(null);

  const peerConnsRef = useRef<Record<number, RTCPeerConnection>>({});
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSigRef   = useRef(0);
  const roomId = `voice_${channelId}`;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(""), 4000); };

  /** Заменяем видео-трек у всех пиров */
  const replaceVideoTrack = useCallback((track: MediaStreamTrack | null) => {
    Object.values(peerConnsRef.current).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender && track) {
        sender.replaceTrack(track).catch(() => {});
      } else if (sender && !track) {
        pc.removeTrack(sender);
      } else if (!sender && track && micStreamRef.current) {
        pc.addTrack(track, micStreamRef.current);
      }
    });
  }, []);

  const getActiveStream = useCallback(() => {
    const s = new MediaStream();
    micStreamRef.current?.getAudioTracks().forEach(t => s.addTrack(t));
    if (screenStreamRef.current) screenStreamRef.current.getVideoTracks().forEach(t => s.addTrack(t));
    else if (camStreamRef.current) camStreamRef.current.getVideoTracks().forEach(t => s.addTrack(t));
    return s;
  }, []);

  // ── WebRTC ────────────────────────────────────────────────────────────────

  const createPeer = useCallback((targetId: number, initiator: boolean) => {
    const existing = peerConnsRef.current[targetId];
    if (existing && !["closed","failed","disconnected"].includes(existing.connectionState)) return existing;

    const pc = new RTCPeerConnection(ICE_CFG);
    peerConnsRef.current[targetId] = pc;

    getActiveStream().getTracks().forEach(t => pc.addTrack(t, getActiveStream()));

    pc.ontrack = ev => {
      const rs = ev.streams[0];
      if (!rs) return;
      const isScr = rs.getVideoTracks().some(t =>
        t.label.toLowerCase().includes("screen") ||
        t.label.toLowerCase().includes("display") ||
        t.label.toLowerCase().includes("window") ||
        t.label.toLowerCase().includes("entire")
      );
      setRemotes(prev => {
        const ex = prev.find(r => r.userId === targetId);
        if (ex) {
          return prev.map(r => r.userId === targetId
            ? { ...r, ...(isScr ? { screenStream: rs } : { camStream: rs }) }
            : r
          );
        }
        return [...prev, {
          userId: targetId,
          displayName: `Участник ${targetId}`,
          avatarColor: "#6a7a8a",
          camStream: isScr ? null : rs,
          screenStream: isScr ? rs : null,
        }];
      });
    };

    pc.onicecandidate = async ev2 => {
      if (!ev2.candidate) return;
      await fetch(SIGNAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", room_id: roomId, sender_id: authUser.user_id, target_id: targetId, signal_type: "ice", payload: ev2.candidate }),
      });
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected","failed","closed"].includes(pc.connectionState)) {
        setRemotes(prev => prev.filter(r => r.userId !== targetId));
        delete peerConnsRef.current[targetId];
      }
    };

    if (initiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then(offer => {
        pc.setLocalDescription(offer);
        fetch(SIGNAL_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send", room_id: roomId, sender_id: authUser.user_id, target_id: targetId, signal_type: "offer", payload: offer }),
        });
      });
    }
    return pc;
  }, [authUser.user_id, roomId, getActiveStream]);

  // ── Start / Stop ───────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setConnecting(true); setError("");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = mic;
      setConnected(true);

      await fetch(SIGNAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", room_id: roomId, sender_id: authUser.user_id }),
      });

      lastSigRef.current = 0;
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${SIGNAL_URL}?action=poll&room_id=${roomId}&user_id=${authUser.user_id}&since_id=${lastSigRef.current}`);
          const sigs = await res.json();
          for (const s of sigs) {
            lastSigRef.current = Math.max(lastSigRef.current, s.id);
            if (s.signal_type === "join") {
              createPeer(s.sender_id, true);
            } else if (s.signal_type === "offer") {
              const pc = createPeer(s.sender_id, false);
              await pc.setRemoteDescription(new RTCSessionDescription(s.payload));
              const ans = await pc.createAnswer();
              await pc.setLocalDescription(ans);
              await fetch(SIGNAL_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send", room_id: roomId, sender_id: authUser.user_id, target_id: s.sender_id, signal_type: "answer", payload: ans }),
              });
            } else if (s.signal_type === "answer") {
              const pc = peerConnsRef.current[s.sender_id];
              if (pc && pc.signalingState !== "stable") await pc.setRemoteDescription(new RTCSessionDescription(s.payload));
            } else if (s.signal_type === "ice") {
              const pc = peerConnsRef.current[s.sender_id];
              if (pc) await pc.addIceCandidate(new RTCIceCandidate(s.payload)).catch(() => {});
            } else if (s.signal_type === "leave") {
              setRemotes(prev => prev.filter(r => r.userId !== s.sender_id));
              peerConnsRef.current[s.sender_id]?.close();
              delete peerConnsRef.current[s.sender_id];
            }
          }
        } catch { /* сеть */ }
      }, 1500);
    } catch {
      showError("Нет доступа к микрофону. Разрешите доступ в браузере.");
    }
    setConnecting(false);
  }, [authUser.user_id, roomId, createPeer]);

  useEffect(() => { start(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const leave = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    Object.values(peerConnsRef.current).forEach(pc => pc.close());
    await fetch(SIGNAL_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", room_id: roomId, sender_id: authUser.user_id }),
    }).catch(() => {});
    onLeave();
  };

  // ── Controls ───────────────────────────────────────────────────────────────

  const toggleMic = () => {
    micStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(p => !p);
  };

  const toggleCam = async () => {
    if (camOn) {
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
      replaceVideoTrack(null);
      setLocalCamStream(null);
      setCamOn(false);
    } else {
      try {
        if (screenOn) {
          screenStreamRef.current?.getTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
          setLocalScreenStream(null);
          setScreenOn(false);
        }
        const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        camStreamRef.current = cam;
        replaceVideoTrack(cam.getVideoTracks()[0]);
        setLocalCamStream(cam);
        setCamOn(true);
      } catch { showError("Нет доступа к камере"); }
    }
  };

  const toggleScreen = async () => {
    if (screenOn) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      replaceVideoTrack(null);
      setLocalScreenStream(null);
      setScreenOn(false);
    } else {
      try {
        if (camOn) {
          camStreamRef.current?.getTracks().forEach(t => t.stop());
          camStreamRef.current = null;
          setLocalCamStream(null);
          setCamOn(false);
        }
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1920, height: 1080, frameRate: 30 },
          audio: true,
        });
        screenStreamRef.current = screen;
        const vt = screen.getVideoTracks()[0];
        vt.onended = () => {
          screenStreamRef.current = null;
          replaceVideoTrack(null);
          setLocalScreenStream(null);
          setScreenOn(false);
        };
        replaceVideoTrack(vt);
        setLocalScreenStream(screen);
        setScreenOn(true);
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== "NotAllowedError") showError("Не удалось захватить экран");
      }
    }
  };

  // ── Сетка ────────────────────────────────────────────────────────────────
  // Все тайлы: свой (камера), свой (экран), чужие (камера + экран отдельно)
  interface TileData {
    key: string;
    stream: MediaStream | null;
    label: string;
    isLocal: boolean;
    isScreen: boolean;
    avatarName: string;
    avatarColor: string;
    clickable: boolean;
    onClickStream: MediaStream | null;
  }

  const tiles: TileData[] = [];

  // Свои тайлы
  tiles.push({
    key: "local-cam",
    stream: localCamStream ?? (connected ? new MediaStream(micStreamRef.current?.getAudioTracks() ?? []) : null),
    label: authUser.display_name,
    isLocal: true, isScreen: false,
    avatarName: authUser.display_name, avatarColor: authUser.avatar_color,
    clickable: false, onClickStream: null,
  });
  if (localScreenStream) {
    tiles.push({
      key: "local-screen",
      stream: localScreenStream,
      label: authUser.display_name,
      isLocal: true, isScreen: true,
      avatarName: authUser.display_name, avatarColor: authUser.avatar_color,
      clickable: false, onClickStream: null,
    });
  }

  // Удалённые
  remotes.forEach(r => {
    tiles.push({
      key: `remote-cam-${r.userId}`,
      stream: r.camStream,
      label: r.displayName,
      isLocal: false, isScreen: false,
      avatarName: r.displayName, avatarColor: r.avatarColor,
      clickable: false, onClickStream: null,
    });
    if (r.screenStream) {
      tiles.push({
        key: `remote-screen-${r.userId}`,
        stream: r.screenStream,
        label: r.displayName,
        isLocal: false, isScreen: true,
        avatarName: r.displayName, avatarColor: r.avatarColor,
        clickable: true,
        onClickStream: r.screenStream,
      });
    }
  });

  const n = tiles.length;
  const gridClass = n <= 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : n <= 4 ? "grid-cols-2" : "grid-cols-3";

  // Считаем сколько активных трансляций у удалённых
  const screenCount = remotes.filter(r => r.screenStream).length;

  return (
    <div className="flex flex-col h-full bg-[#1e2124]">

      {/* Модальный просмотр трансляции */}
      {watchingScreen && (
        <ScreenModal
          stream={watchingScreen.stream}
          label={watchingScreen.label}
          onClose={() => setWatchingScreen(null)}
        />
      )}

      {/* Заголовок */}
      <div className="h-12 bg-[#313338] border-b border-[#1e2124] flex items-center px-4 gap-3 flex-shrink-0">
        <Volume2 className="w-5 h-5 text-[#4a7c4a]" />
        <span className="text-white font-semibold text-sm">{channelName}</span>
        <div className="flex items-center gap-1 text-[#5a7a5a] text-xs">
          <Users className="w-3 h-3" />{1 + remotes.length}
        </div>
        {connecting && (
          <div className="flex items-center gap-2 text-[#5a7a5a] text-xs ml-2">
            <div className="w-3 h-3 border-2 border-[#4a7c4a]/30 border-t-[#4a7c4a] rounded-full animate-spin" />Подключение...
          </div>
        )}
        {connected && !connecting && (
          <div className="flex items-center gap-1.5 text-[#4a7c4a] text-xs ml-2">
            <div className="w-2 h-2 bg-[#4a7c4a] rounded-full animate-pulse" />В эфире
          </div>
        )}
        {screenOn && (
          <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-400 text-xs px-2 py-0.5 rounded-full ml-2">
            <Monitor className="w-3 h-3" />Вы транслируете экран
          </div>
        )}
        {screenCount > 0 && (
          <div className="flex items-center gap-1.5 bg-purple-600/20 border border-purple-500/40 text-purple-400 text-xs px-2 py-0.5 rounded-full ml-1 cursor-default">
            <Monitor className="w-3 h-3" />{screenCount} {screenCount === 1 ? "трансляция" : "трансляции"} — нажми для просмотра
          </div>
        )}
      </div>

      {/* Ошибка */}
      {error && (
        <div className="flex-shrink-0 bg-red-900/30 border-b border-red-800/40 px-4 py-2 text-red-400 text-sm text-center">{error}</div>
      )}

      {/* Сетка */}
      <div className="flex-1 overflow-auto p-4">
        <div className={`grid ${gridClass} gap-3 h-full`} style={{ gridAutoRows: n <= 2 ? "1fr" : "minmax(180px, 1fr)" }}>
          {tiles.map(t => (
            <VideoTile
              key={t.key}
              stream={t.stream}
              label={t.label}
              isLocal={t.isLocal}
              isScreen={t.isScreen}
              avatarName={t.avatarName}
              avatarColor={t.avatarColor}
              clickable={t.clickable}
              onClick={t.onClickStream ? () => setWatchingScreen({ stream: t.onClickStream!, label: t.label }) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Панель управления */}
      <div className="flex-shrink-0 bg-[#232428] border-t border-[#1e2124] px-6 py-3">
        <div className="flex items-center justify-center gap-3 flex-wrap">

          <CtrlBtn
            active={micOn} activeColor="green" inactiveIcon={<MicOff className="w-5 h-5" />}
            activeIcon={<Mic className="w-5 h-5" />}
            label={micOn ? "Микрофон" : "Без звука"}
            onClick={toggleMic}
          />
          <CtrlBtn
            active={camOn} activeColor="green" inactiveIcon={<VideoOff className="w-5 h-5" />}
            activeIcon={<Video className="w-5 h-5" />}
            label={camOn ? "Камера вкл" : "Камера"}
            onClick={toggleCam}
          />
          <CtrlBtn
            active={screenOn} activeColor="blue" inactiveIcon={<Monitor className="w-5 h-5" />}
            activeIcon={<MonitorOff className="w-5 h-5" />}
            label={screenOn ? "Стоп экран" : "Экран"}
            onClick={toggleScreen}
            highlight={screenOn}
          />
          <CtrlBtn
            active={!deafened} activeColor="gray" inactiveIcon={<VolumeX className="w-5 h-5" />}
            activeIcon={<Volume2 className="w-5 h-5" />}
            label={deafened ? "Заглушено" : "Звук"}
            onClick={() => setDeafened(d => !d)}
          />

          <div className="w-px h-10 bg-[#35373c]" />

          <button onClick={leave} className="flex flex-col items-center gap-1 group">
            <div className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-lg">
              <PhoneOff className="w-5 h-5" />
            </div>
            <span className="text-[#5a7a5a] text-xs group-hover:text-red-400 transition-colors">Выйти</span>
          </button>
        </div>

        {/* Статус */}
        <div className="flex items-center justify-center gap-3 mt-2 text-xs flex-wrap">
          <span className={micOn ? "text-[#4a7c4a]" : "text-red-400"}>{micOn ? "🎙 Микрофон" : "🔇 Выкл"}</span>
          {camOn && <span className="text-[#4a7c4a]">📹 Камера</span>}
          {screenOn && <span className="text-blue-400 font-medium">🖥 Трансляция активна</span>}
          {screenCount > 0 && (
            <span className="text-purple-400">
              👁 {screenCount} пользов. транслируют — <button className="underline hover:text-white" onClick={() => {
                const first = remotes.find(r => r.screenStream);
                if (first?.screenStream) setWatchingScreen({ stream: first.screenStream, label: first.displayName });
              }}>смотреть</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Кнопка управления ──────────────────────────────────────────────────────────
function CtrlBtn({ active, activeColor, activeIcon, inactiveIcon, label, onClick, highlight }: {
  active: boolean; activeColor: "green" | "blue" | "gray";
  activeIcon: React.ReactNode; inactiveIcon: React.ReactNode;
  label: string; onClick: () => void; highlight?: boolean;
}) {
  const bg = active
    ? activeColor === "green" ? "bg-[#4a7c4a] hover:bg-[#5a8c5a]"
    : activeColor === "blue"  ? "bg-blue-600 hover:bg-blue-700"
    : "bg-[#35373c] hover:bg-[#3d4044]"
    : "bg-[#35373c] hover:bg-[#3d4044]";

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg text-white ${bg} ${highlight ? "ring-2 ring-blue-400" : ""}`}>
        {active ? activeIcon : inactiveIcon}
      </div>
      <span className="text-[#5a7a5a] text-xs group-hover:text-white transition-colors whitespace-nowrap">{label}</span>
    </button>
  );
}
