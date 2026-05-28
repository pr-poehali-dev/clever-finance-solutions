import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  PhoneOff, Users, Volume2, VolumeX, Maximize2, Minimize2,
} from "lucide-react";

const SIGNAL_URL = "https://functions.poehali.dev/5f7bfb3f-7664-4e1e-aa94-20af798645a7";
const ICE_CFG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

interface Props {
  channelId: number;
  channelName: string;
  authUser: { user_id: number; display_name: string; avatar_color: string };
  onLeave: () => void;
}

interface RemoteParticipant {
  userId: number;
  stream: MediaStream;
  isScreen: boolean;
}

// ── Плашка одного участника ─────────────────────────────────────────────────
function Tile({ stream, label, isLocal, isScreen, avatarName, avatarColor, muted }: {
  stream: MediaStream | null;
  label: string;
  isLocal: boolean;
  isScreen: boolean;
  avatarName: string;
  avatarColor: string;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fsMode, setFsMode] = useState(false);
  const hasVideo = stream && stream.getVideoTracks().some(t => t.readyState === "live" && t.enabled);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className={`relative bg-[#111214] rounded-2xl overflow-hidden border border-[#2a2d31] flex items-center justify-center group transition-all
      ${fsMode ? "fixed inset-4 z-50 rounded-2xl" : "w-full h-full min-h-[180px]"}`}>

      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal || !!muted}
          className={`w-full h-full ${isScreen ? "object-contain bg-black" : "object-cover"}`} />
      ) : (
        <div className="flex flex-col items-center gap-3 select-none">
          <div className="rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-lg"
            style={{ width: 72, height: 72, backgroundColor: avatarColor }}>
            {avatarName?.[0]?.toUpperCase()}
          </div>
        </div>
      )}

      {/* Нижняя плашка */}
      <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2">
        {isScreen && <Monitor className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
        <span className="text-white text-xs font-semibold truncate flex-1">{label}{isLocal ? " (вы)" : ""}</span>
        <button onClick={() => setFsMode(f => !f)} className="opacity-0 group-hover:opacity-100 text-white/60 hover:text-white transition-opacity">
          {fsMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {isLocal && (
        <div className="absolute top-2 left-2 bg-[#4a7c4a]/90 text-white text-xs px-2 py-0.5 rounded-full font-semibold">ВЫ</div>
      )}
      {isScreen && !isLocal && (
        <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
          <Monitor className="w-3 h-3" /> Экран
        </div>
      )}

      {/* Закрыть фуллскрин по клику на фон */}
      {fsMode && <div className="absolute inset-0 -z-10" onClick={() => setFsMode(false)} />}
    </div>
  );
}

// ── Главный компонент ────────────────────────────────────────────────────────
export default function VoiceChannel({ channelId, channelName, authUser, onLeave }: Props) {
  const [micOn, setMicOn]       = useState(true);
  const [camOn, setCamOn]       = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError]           = useState("");

  // Локальные стримы
  const micStreamRef    = useRef<MediaStream | null>(null); // аудио
  const camStreamRef    = useRef<MediaStream | null>(null); // камера
  const screenStreamRef = useRef<MediaStream | null>(null); // экран

  // Что отображаем в своём тайле
  const [localDisplayStream, setLocalDisplayStream] = useState<MediaStream | null>(null);
  const [localIsScreen, setLocalIsScreen] = useState(false);

  // Удалённые участники
  const [remotes, setRemotes] = useState<RemoteParticipant[]>([]);

  const peerConnsRef  = useRef<Record<number, RTCPeerConnection>>({});
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSigRef    = useRef(0);
  const roomId        = `voice_${channelId}`;

  // ── Вспомогательные ────────────────────────────────────────────────────────

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

  /** Добавляем аудио-трек к пиру */
  const getActiveStream = useCallback((): MediaStream => {
    const s = new MediaStream();
    micStreamRef.current?.getAudioTracks().forEach(t => s.addTrack(t));
    if (screenStreamRef.current) {
      screenStreamRef.current.getVideoTracks().forEach(t => s.addTrack(t));
    } else if (camStreamRef.current) {
      camStreamRef.current.getVideoTracks().forEach(t => s.addTrack(t));
    }
    return s;
  }, []);

  const createPeer = useCallback((targetId: number, initiator: boolean) => {
    const existing = peerConnsRef.current[targetId];
    if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") return existing;

    const pc = new RTCPeerConnection(ICE_CFG);
    peerConnsRef.current[targetId] = pc;

    // Добавляем текущие треки
    const stream = getActiveStream();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = ev => {
      const rs = ev.streams[0];
      if (!rs) return;
      const isScr = rs.getVideoTracks().some(t =>
        t.label.toLowerCase().includes("screen") || t.label.toLowerCase().includes("display") || t.label.toLowerCase().includes("window")
      );
      setRemotes(prev => {
        const ex = prev.find(r => r.userId === targetId);
        if (ex) return prev.map(r => r.userId === targetId ? { ...r, stream: rs, isScreen: isScr } : r);
        return [...prev, { userId: targetId, stream: rs, isScreen: isScr }];
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

  // ── Старт ──────────────────────────────────────────────────────────────────
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
    } catch (e) {
      setError("Нет доступа к микрофону. Разрешите доступ в браузере.");
    }
    setConnecting(false);
  }, [authUser.user_id, roomId, createPeer]);

  useEffect(() => { start(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  // ── Выход ──────────────────────────────────────────────────────────────────
  const leave = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    Object.values(peerConnsRef.current).forEach(pc => pc.close());
    peerConnsRef.current = {};
    await fetch(SIGNAL_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", room_id: roomId, sender_id: authUser.user_id }),
    }).catch(() => {});
    onLeave();
  };

  // ── Микрофон ───────────────────────────────────────────────────────────────
  const toggleMic = () => {
    micStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(p => !p);
  };

  // ── Камера ─────────────────────────────────────────────────────────────────
  const toggleCam = async () => {
    if (camOn) {
      camStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      camStreamRef.current = null;
      replaceVideoTrack(null);
      setCamOn(false);
      setLocalDisplayStream(micStreamRef.current);
      setLocalIsScreen(false);
    } else {
      try {
        // Сначала останавливаем экран если был
        if (screenOn) {
          screenStreamRef.current?.getVideoTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
          setScreenOn(false);
        }
        const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        camStreamRef.current = cam;
        const vt = cam.getVideoTracks()[0];
        replaceVideoTrack(vt);
        // Собираем стрим для отображения
        const display = new MediaStream([...(micStreamRef.current?.getAudioTracks() || []), vt]);
        setLocalDisplayStream(display);
        setLocalIsScreen(false);
        setCamOn(true);
      } catch { setError("Нет доступа к камере"); setTimeout(() => setError(""), 3000); }
    }
  };

  // ── Трансляция экрана ──────────────────────────────────────────────────────
  const toggleScreen = async () => {
    if (screenOn) {
      // Остановить трансляцию
      screenStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      replaceVideoTrack(null);
      setScreenOn(false);
      setLocalDisplayStream(micStreamRef.current);
      setLocalIsScreen(false);
    } else {
      try {
        // Останавливаем камеру если была
        if (camOn) {
          camStreamRef.current?.getVideoTracks().forEach(t => t.stop());
          camStreamRef.current = null;
          setCamOn(false);
        }

        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1920, height: 1080, frameRate: 30 },
          audio: true,
        });
        screenStreamRef.current = screen;

        const vt = screen.getVideoTracks()[0];

        // Когда пользователь сам остановил захват экрана
        vt.onended = () => {
          screenStreamRef.current = null;
          replaceVideoTrack(null);
          setScreenOn(false);
          setLocalDisplayStream(micStreamRef.current);
          setLocalIsScreen(false);
        };

        replaceVideoTrack(vt);

        // Собираем стрим для отображения (аудио мик + видео экран)
        const display = new MediaStream([
          ...(micStreamRef.current?.getAudioTracks() || []),
          vt,
          ...screen.getAudioTracks(), // системный звук если разрешён
        ]);
        setLocalDisplayStream(display);
        setLocalIsScreen(true);
        setScreenOn(true);
      } catch (e: unknown) {
        // Пользователь отменил — не показываем ошибку
        if (e instanceof Error && e.name !== "NotAllowedError") {
          setError("Не удалось захватить экран"); setTimeout(() => setError(""), 3000);
        }
      }
    }
  };

  // ── Сетка ──────────────────────────────────────────────────────────────────
  const totalTiles = 1 + remotes.length;
  const gridClass =
    totalTiles === 1 ? "grid-cols-1" :
    totalTiles === 2 ? "grid-cols-2" :
    totalTiles <= 4  ? "grid-cols-2" :
    totalTiles <= 6  ? "grid-cols-3" : "grid-cols-3";

  return (
    <div className="flex flex-col h-full bg-[#1e2124]">

      {/* Заголовок */}
      <div className="h-12 bg-[#313338] border-b border-[#1e2124] flex items-center px-4 gap-3 flex-shrink-0">
        <Volume2 className="w-5 h-5 text-[#4a7c4a]" />
        <span className="text-white font-semibold text-sm">{channelName}</span>
        <div className="flex items-center gap-1 text-[#5a7a5a] text-xs">
          <Users className="w-3 h-3" />{totalTiles}
        </div>
        {connecting && (
          <div className="flex items-center gap-2 text-[#5a7a5a] text-xs ml-2">
            <div className="w-3 h-3 border-2 border-[#4a7c4a]/30 border-t-[#4a7c4a] rounded-full animate-spin" />
            Подключение...
          </div>
        )}
        {connected && !connecting && (
          <div className="flex items-center gap-1.5 text-[#4a7c4a] text-xs ml-2">
            <div className="w-2 h-2 bg-[#4a7c4a] rounded-full animate-pulse" />В эфире
          </div>
        )}
        {screenOn && (
          <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-400 text-xs px-2 py-0.5 rounded-full ml-2">
            <Monitor className="w-3 h-3" /> Трансляция экрана
          </div>
        )}
      </div>

      {/* Ошибка */}
      {error && (
        <div className="flex-shrink-0 bg-red-900/30 border-b border-red-800/40 px-4 py-2 text-red-400 text-sm text-center">{error}</div>
      )}

      {/* Сетка участников */}
      <div className="flex-1 overflow-auto p-4">
        {totalTiles === 1 && !localDisplayStream && (
          <div className="h-full flex flex-col items-center justify-center text-[#5a7a5a]">
            <Volume2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-semibold text-[#3a4a3a]">Голосовой канал</p>
            <p className="text-sm mt-1 text-center max-w-xs">Вы подключены. Включите камеру или трансляцию экрана,<br/>чтобы вас видели участники.</p>
          </div>
        )}
        <div className={`grid ${gridClass} gap-3 h-full`}>
          {/* Свой тайл */}
          <Tile
            stream={localDisplayStream}
            label={authUser.display_name}
            isLocal={true}
            isScreen={localIsScreen}
            avatarName={authUser.display_name}
            avatarColor={authUser.avatar_color}
          />
          {/* Удалённые */}
          {remotes.map(r => (
            <Tile
              key={r.userId}
              stream={r.stream}
              label={`Участник ${r.userId}`}
              isLocal={false}
              isScreen={r.isScreen}
              avatarName={`U${r.userId}`}
              avatarColor="#6a7a8a"
            />
          ))}
        </div>
      </div>

      {/* Панель управления */}
      <div className="flex-shrink-0 bg-[#232428] border-t border-[#1e2124] px-6 py-4">
        <div className="flex items-center justify-center gap-3 flex-wrap">

          {/* Микрофон */}
          <button onClick={toggleMic} title={micOn ? "Выключить микрофон" : "Включить микрофон"}
            className={`flex flex-col items-center gap-1 w-16 group`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
              micOn ? "bg-[#35373c] hover:bg-[#3d4044] text-white" : "bg-red-600 hover:bg-red-700 text-white"
            }`}>
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </div>
            <span className="text-[#5a7a5a] text-xs group-hover:text-white transition-colors">
              {micOn ? "Микрофон" : "Без звука"}
            </span>
          </button>

          {/* Камера */}
          <button onClick={toggleCam} title={camOn ? "Выключить камеру" : "Включить камеру"}
            className="flex flex-col items-center gap-1 w-16 group">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
              camOn ? "bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white" : "bg-[#35373c] hover:bg-[#3d4044] text-[#8a9e8a] hover:text-white"
            }`}>
              {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </div>
            <span className="text-[#5a7a5a] text-xs group-hover:text-white transition-colors">
              {camOn ? "Камера вкл" : "Камера"}
            </span>
          </button>

          {/* Трансляция экрана */}
          <button onClick={toggleScreen} title={screenOn ? "Остановить трансляцию" : "Транслировать экран"}
            className="flex flex-col items-center gap-1 w-20 group">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
              screenOn ? "bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400" : "bg-[#35373c] hover:bg-blue-600 text-[#8a9e8a] hover:text-white"
            }`}>
              {screenOn ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </div>
            <span className={`text-xs group-hover:text-white transition-colors ${screenOn ? "text-blue-400" : "text-[#5a7a5a]"}`}>
              {screenOn ? "Стоп экран" : "Экран"}
            </span>
          </button>

          {/* Заглушить */}
          <button onClick={() => setDeafened(d => !d)} title={deafened ? "Включить звук" : "Заглушить всё"}
            className="flex flex-col items-center gap-1 w-16 group">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
              deafened ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#35373c] hover:bg-[#3d4044] text-[#8a9e8a] hover:text-white"
            }`}>
              {deafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </div>
            <span className="text-[#5a7a5a] text-xs group-hover:text-white transition-colors">
              {deafened ? "Заглушено" : "Звук"}
            </span>
          </button>

          <div className="w-px h-10 bg-[#35373c]" />

          {/* Выйти */}
          <button onClick={leave} title="Покинуть канал"
            className="flex flex-col items-center gap-1 w-16 group">
            <div className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-lg">
              <PhoneOff className="w-5 h-5" />
            </div>
            <span className="text-[#5a7a5a] text-xs group-hover:text-red-400 transition-colors">Выйти</span>
          </button>
        </div>

        {/* Статус строка */}
        <div className="flex items-center justify-center gap-4 mt-3 text-xs flex-wrap">
          <span className={micOn ? "text-[#4a7c4a]" : "text-red-400"}>
            {micOn ? "🎙 Микрофон активен" : "🔇 Микрофон выкл"}
          </span>
          {camOn && <span className="text-[#4a7c4a]">📹 Камера активна</span>}
          {screenOn && (
            <span className="text-blue-400 flex items-center gap-1 font-medium">
              <Monitor className="w-3 h-3" /> Трансляция экрана активна
            </span>
          )}
          <span className="text-[#5a7a5a]">{totalTiles} участн.</span>
        </div>
      </div>
    </div>
  );
}
