import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  PhoneOff, Users, Volume2, VolumeX, Maximize2, Minimize2,
  Radio,
} from "lucide-react";

const SIGNAL_URL = "https://functions.poehali.dev/5f7bfb3f-7664-4e1e-aa94-20af798645a7";
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

interface Participant {
  userId: number;
  displayName: string;
  avatarColor: string;
  stream: MediaStream | null;
  micOn: boolean;
  videoOn: boolean;
  isScreen: boolean;
}

interface Props {
  channelId: number;
  channelName: string;
  authUser: { user_id: number; display_name: string; avatar_color: string };
  onLeave: () => void;
}

function Avatar({ name, color, size = 16 }: { name: string; color?: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color || "#4a7c4a", fontSize: size * 0.38 }}
    >
      {name?.[0]?.toUpperCase()}
    </div>
  );
}

function VideoTile({
  participant, isLocal, large,
}: {
  participant: Participant; isLocal: boolean; large: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const hasVideo = participant.stream &&
    participant.stream.getVideoTracks().some(t => t.enabled && t.readyState === "live");

  return (
    <div
      className={`relative bg-[#111214] rounded-xl overflow-hidden border border-[#2a2d31] flex items-center justify-center group
        ${large ? "min-h-[280px]" : "min-h-[160px]"}
        ${fullscreen ? "fixed inset-4 z-50 min-h-0" : ""}
      `}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Avatar name={participant.displayName} color={participant.avatarColor} size={large ? 80 : 52} />
          {!participant.micOn && (
            <div className="bg-red-600/80 rounded-full p-1">
              <MicOff className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      )}

      {/* Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {participant.isScreen && <Monitor className="w-3 h-3 text-blue-400 flex-shrink-0" />}
          <span className="text-white text-xs font-medium truncate">
            {isLocal ? `${participant.displayName} (вы)` : participant.displayName}
          </span>
        </div>
        <div className="flex gap-1">
          {!participant.micOn && <MicOff className="w-3 h-3 text-red-400" />}
          {!participant.videoOn && !participant.isScreen && <VideoOff className="w-3 h-3 text-red-400" />}
        </div>
        <button
          onClick={() => setFullscreen(f => !f)}
          className="opacity-0 group-hover:opacity-100 text-white/70 hover:text-white transition-all"
        >
          {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      </div>

      {isLocal && (
        <div className="absolute top-2 right-2 bg-[#4a7c4a] text-white text-xs px-1.5 py-0.5 rounded font-medium">ВЫ</div>
      )}
    </div>
  );
}

export default function VoiceChannel({ channelId, channelName, authUser, onLeave }: Props) {
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnsRef = useRef<Record<number, RTCPeerConnection>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSignalIdRef = useRef(0);
  const roomId = `voice_${channelId}`;

  // Мой тайл
  const localParticipant: Participant = {
    userId: authUser.user_id,
    displayName: authUser.display_name,
    avatarColor: authUser.avatar_color,
    stream: screenOn ? screenStreamRef.current : localStreamRef.current,
    micOn,
    videoOn: screenOn ? true : videoOn,
    isScreen: screenOn,
  };

  const addOrUpdateParticipant = useCallback((userId: number, stream: MediaStream, isScreen = false) => {
    setParticipants(prev => {
      const exists = prev.find(p => p.userId === userId);
      const update: Participant = {
        userId,
        displayName: `Участник ${userId}`,
        avatarColor: "#6a7a8a",
        stream,
        micOn: true,
        videoOn: true,
        isScreen,
      };
      if (exists) return prev.map(p => p.userId === userId ? { ...p, stream, isScreen } : p);
      return [...prev, update];
    });
  }, []);

  const removeParticipant = useCallback((userId: number) => {
    setParticipants(prev => prev.filter(p => p.userId !== userId));
    peerConnsRef.current[userId]?.close();
    delete peerConnsRef.current[userId];
  }, []);

  const createPeer = useCallback((targetId: number, initiator: boolean, stream: MediaStream) => {
    const existing = peerConnsRef.current[targetId];
    if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") return existing;

    const pc = new RTCPeerConnection(ICE);
    peerConnsRef.current[targetId] = pc;

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = e => {
      const s = e.streams[0];
      const isScreen = s.getVideoTracks().some(t => t.label.toLowerCase().includes("screen") || t.label.toLowerCase().includes("display"));
      addOrUpdateParticipant(targetId, s, isScreen);
    };

    pc.onicecandidate = async ev => {
      if (!ev.candidate) return;
      await fetch(SIGNAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", room_id: roomId, sender_id: authUser.user_id, target_id: targetId, signal_type: "ice", payload: ev.candidate }),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        removeParticipant(targetId);
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
  }, [authUser.user_id, roomId, addOrUpdateParticipant, removeParticipant]);

  // Старт — получить микрофон и войти в комнату
  const start = useCallback(async () => {
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setConnected(true);

      await fetch(SIGNAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", room_id: roomId, sender_id: authUser.user_id }),
      });

      lastSignalIdRef.current = 0;
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${SIGNAL_URL}?action=poll&room_id=${roomId}&user_id=${authUser.user_id}&since_id=${lastSignalIdRef.current}`);
          const sigs = await res.json();
          for (const s of sigs) {
            lastSignalIdRef.current = Math.max(lastSignalIdRef.current, s.id);
            const activeStream = screenStreamRef.current || localStreamRef.current;
            if (!activeStream) continue;

            if (s.signal_type === "join") {
              if (!peerConnsRef.current[s.sender_id]) createPeer(s.sender_id, true, activeStream);
            } else if (s.signal_type === "offer") {
              let pc = peerConnsRef.current[s.sender_id];
              if (!pc) pc = createPeer(s.sender_id, false, activeStream);
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
              removeParticipant(s.sender_id);
            }
          }
        } catch { /* сеть недоступна */ }
      }, 1500);
    } catch {
      setConnecting(false);
    }
    setConnecting(false);
  }, [authUser.user_id, roomId, createPeer, removeParticipant]);

  useEffect(() => {
    start();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const leave = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    Object.values(peerConnsRef.current).forEach(pc => pc.close());
    peerConnsRef.current = {};
    await fetch(SIGNAL_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", room_id: roomId, sender_id: authUser.user_id }),
    });
    onLeave();
  };

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(p => !p);
  };

  const toggleVideo = async () => {
    if (videoOn) {
      localStreamRef.current?.getVideoTracks().forEach(t => { t.stop(); });
      const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = audioOnly;
      // Обновляем треки у всех пиров
      Object.values(peerConnsRef.current).forEach(pc => {
        const senders = pc.getSenders();
        senders.forEach(s => { if (s.track?.kind === "video") pc.removeTrack(s); });
      });
      setVideoOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = stream;
        Object.values(peerConnsRef.current).forEach(pc => {
          stream.getTracks().forEach(t => {
            const sender = pc.getSenders().find(s => s.track?.kind === t.kind);
            if (sender) sender.replaceTrack(t);
            else pc.addTrack(t, stream);
          });
        });
        setVideoOn(true);
        setScreenOn(false);
      } catch { /* нет камеры */ }
    }
  };

  const toggleScreen = async () => {
    if (screenOn) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      // Возвращаем аудио-поток
      Object.values(peerConnsRef.current).forEach(pc => {
        const senders = pc.getSenders();
        senders.forEach(s => { if (s.track?.kind === "video") pc.removeTrack(s); });
      });
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = screen;
        screen.getVideoTracks()[0].onended = () => { setScreenOn(false); screenStreamRef.current = null; };
        Object.values(peerConnsRef.current).forEach(pc => {
          screen.getTracks().forEach(t => {
            const sender = pc.getSenders().find(s => s.track?.kind === t.kind);
            if (sender) sender.replaceTrack(t);
            else pc.addTrack(t, screen);
          });
        });
        setScreenOn(true);
        setVideoOn(false);
      } catch { /* отмена */ }
    }
  };

  const allParticipants = [localParticipant, ...participants];
  const count = allParticipants.length;

  // Сетка: 1 = full, 2 = половина, 3-4 = 2x2, 5+ = 3x3
  const gridClass = count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-2" : count <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="flex flex-col h-full bg-[#1e2124]">

      {/* Заголовок */}
      <div className="h-12 bg-[#313338] border-b border-[#1e2124] flex items-center px-4 gap-3 flex-shrink-0">
        <Volume2 className="w-5 h-5 text-[#4a7c4a]" />
        <span className="text-white font-semibold text-sm">{channelName}</span>
        <div className="flex items-center gap-1 text-[#5a7a5a] text-xs ml-1">
          <Users className="w-3 h-3" />
          <span>{count}</span>
        </div>
        {connecting && (
          <div className="flex items-center gap-2 text-[#5a7a5a] text-xs ml-2">
            <div className="w-3 h-3 border-2 border-[#4a7c4a]/30 border-t-[#4a7c4a] rounded-full animate-spin" />
            Подключение...
          </div>
        )}
        {connected && !connecting && (
          <div className="flex items-center gap-1.5 text-[#4a7c4a] text-xs ml-2">
            <div className="w-2 h-2 bg-[#4a7c4a] rounded-full animate-pulse" />
            В эфире
          </div>
        )}
      </div>

      {/* Сетка участников */}
      <div className="flex-1 overflow-auto p-4">
        {count === 0 || (count === 1 && !localParticipant.stream) ? (
          <div className="h-full flex flex-col items-center justify-center text-[#5a7a5a]">
            <Volume2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-semibold text-[#3a4a3a]">Голосовой канал</p>
            <p className="text-sm mt-1">Вы единственный участник. Пригласите других!</p>
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-3 h-full`}>
            {allParticipants.map((p, i) => (
              <VideoTile
                key={p.userId}
                participant={p}
                isLocal={p.userId === authUser.user_id}
                large={count === 1 || (count === 2)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Панель управления */}
      <div className="flex-shrink-0 bg-[#232428] border-t border-[#1e2124] px-6 py-4">
        <div className="flex items-center justify-center gap-3">

          {/* Микрофон */}
          <button
            onClick={toggleMic}
            title={micOn ? "Выключить микрофон" : "Включить микрофон"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              micOn ? "bg-[#35373c] hover:bg-[#3d4044] text-white" : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Камера */}
          <button
            onClick={toggleVideo}
            title={videoOn ? "Выключить камеру" : "Включить камеру"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              videoOn ? "bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white" : "bg-[#35373c] hover:bg-[#3d4044] text-white"
            }`}
          >
            {videoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Демонстрация экрана */}
          <button
            onClick={toggleScreen}
            title={screenOn ? "Остановить трансляцию" : "Транслировать экран"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              screenOn ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-[#35373c] hover:bg-[#3d4044] text-white"
            }`}
          >
            {screenOn ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </button>

          {/* Заглушить всех */}
          <button
            onClick={() => setDeafened(d => !d)}
            title={deafened ? "Включить звук" : "Заглушить всех"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              deafened ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#35373c] hover:bg-[#3d4044] text-white"
            }`}
          >
            {deafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <div className="w-px h-8 bg-[#3a3d42]" />

          {/* Выйти */}
          <button
            onClick={leave}
            title="Покинуть канал"
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        {/* Статус */}
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-[#5a7a5a]">
          <span className={micOn ? "text-white" : "text-red-400"}>
            {micOn ? "🎙 Микрофон вкл" : "🎙 Микрофон выкл"}
          </span>
          {videoOn && <span className="text-[#4a7c4a]">📹 Камера вкл</span>}
          {screenOn && <span className="text-blue-400">🖥 Трансляция экрана</span>}
          <span>{count} участн.</span>
        </div>
      </div>
    </div>
  );
}
