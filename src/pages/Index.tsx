import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, Radio, Users, Mic, MicOff, Search, Menu, X, Send,
  UserPlus, Check, LogOut, Lock, Video, VideoOff, Monitor, Hash,
  Plus, Copy, PhoneOff, Tv2, Settings, Bell, BellOff, ChevronDown,
  ChevronRight, Smile, MoreHorizontal, Circle, Headphones, HeadphoneOff,
  UserCircle, Edit3, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const AUTH_URL     = "https://functions.poehali.dev/9f1f6cd4-ef39-4d6c-8aa9-a3b0fa392d42";
const FRIENDS_URL  = "https://functions.poehali.dev/c818513e-108b-491b-be7a-8ae1d7792675";
const MESSAGES_URL = "https://functions.poehali.dev/edca8417-913a-4596-b3b6-60b77e61e61d";
const CHANNELS_URL = "https://functions.poehali.dev/f35d98d7-e2b9-449e-9290-47e0fd517ec0";
const SIGNAL_URL   = "https://functions.poehali.dev/5f7bfb3f-7664-4e1e-aa94-20af798645a7";
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

interface AuthUser { user_id: number; username: string; display_name: string; token: string; avatar_color: string; status: string; bio: string; }
interface Friend { friendship_id: number; status: string; direction: string; user: { id: number; username: string; display_name: string; avatar_color?: string; status?: string }; }
interface Message { id: number; sender_id: number; content: string; created_at: string; display_name: string; }
interface Channel { id: number; name: string; description: string; invite_code: string; owner_id: number; member_count: number; type: string; category: string; }
type ChatView = { type: "dm"; friend: Friend } | { type: "channel"; channel: Channel } | null;

const EMOJIS = ["👍","❤️","😂","😮","😢","🔥","✅","⚡"];

function Avatar({ name, color, size = 9, status }: { name: string; color?: string; size?: number; status?: string }) {
  const s = `w-${size} h-${size}`;
  const statusColor = status === "online" ? "bg-green-500" : status === "idle" ? "bg-yellow-500" : status === "dnd" ? "bg-red-500" : "bg-gray-500";
  return (
    <div className={`${s} rounded-full flex items-center justify-center text-white font-bold relative flex-shrink-0`} style={{ backgroundColor: color || "#4a7c4a", fontSize: size * 1.8 }}>
      <span style={{ fontSize: size * 1.5 }}>{name?.[0]?.toUpperCase()}</span>
      {status !== undefined && <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${statusColor} rounded-full border-2 border-[#1e2124]`} />}
    </div>
  );
}

export default function Index() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const s = localStorage.getItem("link_user"); return s ? JSON.parse(s) : null;
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ username: "", display_name: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { setShowInstallBanner(false); setInstallPrompt(null); }
  };

  const [tab, setTab] = useState<"friends" | "channels">("friends");
  const [activeView, setActiveView] = useState<ChatView>(null);
  const activeChatRef = useRef<ChatView>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; username: string; display_name: string; avatar_color?: string }[]>([]);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendsTab, setFriendsTab] = useState<"all" | "pending" | "add">("all");

  const [channels, setChannels] = useState<Channel[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: "", description: "", type: "text" });
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [copiedCode, setCopiedCode] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgCountRef = useRef(0);

  // WebRTC
  const [inCall, setInCall] = useState(false);
  const [callMode, setCallMode] = useState<"video" | "screen" | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<{ userId: number; stream: MediaStream; display_name: string }[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnsRef = useRef<Record<number, RTCPeerConnection>>({});
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSignalIdRef = useRef(0);
  const roomIdRef = useRef("");

  // ─── AUTH ───────────────────────────────────────────────
  const saveUser = (u: AuthUser) => { setAuthUser(u); localStorage.setItem("link_user", JSON.stringify(u)); };

  const logout = useCallback(async () => {
    if (authUser) await fetch(`${AUTH_URL}/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id }) });
    stopCall();
    setAuthUser(null); localStorage.removeItem("link_user");
    setFriends([]); setChannels([]); setActiveView(null); setMessages([]);
  }, [authUser]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const path = authMode === "login" ? "/login" : "/register";
      const body: Record<string, string> = { username: authForm.username, password: authForm.password };
      if (authMode === "register") body.display_name = authForm.display_name;
      const res = await fetch(`${AUTH_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Ошибка сервера");
        return;
      }
      saveUser({
        ...data,
        avatar_color: data.avatar_color || "#4a7c4a",
        bio: data.bio || "",
        status: data.status || "online",
      });
    } catch {
      setAuthError("Нет соединения с сервером. Попробуйте ещё раз.");
    } finally {
      setAuthLoading(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!authUser) return;
    await fetch(`${AUTH_URL}/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, status }) });
    saveUser({ ...authUser, status });
  };

  // ─── FRIENDS ────────────────────────────────────────────
  const loadFriends = useCallback(async () => {
    if (!authUser) return;
    const res = await fetch(`${FRIENDS_URL}/list?user_id=${authUser.user_id}`);
    setFriends(await res.json());
  }, [authUser]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !authUser) return;
    const res = await fetch(`${FRIENDS_URL}/search?q=${encodeURIComponent(searchQuery)}&user_id=${authUser.user_id}`);
    setSearchResults(await res.json());
  };
  const sendFriendReq = async (targetId: number) => {
    if (!authUser) return;
    await fetch(`${FRIENDS_URL}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, target_id: targetId }) });
    setSearchResults([]); setSearchQuery(""); loadFriends();
  };
  const acceptFriend = async (fid: number) => {
    if (!authUser) return;
    await fetch(`${FRIENDS_URL}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, friendship_id: fid }) });
    loadFriends();
  };

  // ─── CHANNELS ───────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    if (!authUser) return;
    const res = await fetch(`${CHANNELS_URL}/list?user_id=${authUser.user_id}`);
    setChannels(await res.json());
  }, [authUser]);

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault(); if (!authUser || !channelForm.name.trim()) return;
    await fetch(`${CHANNELS_URL}/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, ...channelForm }) });
    setChannelForm({ name: "", description: "", type: "text" }); setShowCreateChannel(false); loadChannels();
  };
  const joinChannel = async (e: React.FormEvent) => {
    e.preventDefault(); if (!authUser || !joinCode.trim()) return;
    await fetch(`${CHANNELS_URL}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, invite_code: joinCode }) });
    setJoinCode(""); setShowJoin(false); loadChannels();
  };
  const copyCode = (code: string) => { navigator.clipboard.writeText(code); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); };

  // ─── MESSAGES ───────────────────────────────────────────
  const loadMessages = useCallback(async (view: ChatView) => {
    if (!authUser || !view) return;
    let res: Response;
    if (view.type === "dm") res = await fetch(`${MESSAGES_URL}/history?user_id=${authUser.user_id}&friend_id=${view.friend.user.id}`);
    else res = await fetch(`${CHANNELS_URL}/history?channel_id=${view.channel.id}`);
    const data: Message[] = await res.json();
    lastMsgCountRef.current = data.length;
    setMessages(data);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [authUser]);

  const openView = (view: ChatView) => {
    setActiveView(view); activeChatRef.current = view;
    setMobileSidebarOpen(false); setMessages([]); lastMsgCountRef.current = 0;
    loadMessages(view);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !authUser || !activeView) return;
    setSendingMsg(true);
    if (activeView.type === "dm") await fetch(`${MESSAGES_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender_id: authUser.user_id, receiver_id: activeView.friend.user.id, content: messageText }) });
    else await fetch(`${CHANNELS_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel_id: activeView.channel.id, sender_id: authUser.user_id, content: messageText }) });
    setMessageText(""); await loadMessages(activeView); setSendingMsg(false);
  };

  // ─── WEBRTC ─────────────────────────────────────────────
  const getRoomId = (view: ChatView) => {
    if (!view) return "";
    if (view.type === "dm") return `dm_${Math.min(authUser!.user_id, view.friend.user.id)}_${Math.max(authUser!.user_id, view.friend.user.id)}`;
    return `ch_${view.channel.id}`;
  };

  const createPeer = useCallback((targetId: number, initiator: boolean, stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE);
    peerConnsRef.current[targetId] = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = e => {
      const rs = e.streams[0];
      setRemoteStreams(prev => {
        const ex = prev.find(r => r.userId === targetId);
        if (ex) return prev.map(r => r.userId === targetId ? { ...r, stream: rs } : r);
        return [...prev, { userId: targetId, stream: rs, display_name: `Участник ${targetId}` }];
      });
    };
    pc.onicecandidate = async ev => {
      if (!ev.candidate || !authUser) return;
      await fetch(`${SIGNAL_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomIdRef.current, sender_id: authUser.user_id, target_id: targetId, signal_type: "ice", payload: ev.candidate }) });
    };
    if (initiator) pc.createOffer().then(o => { pc.setLocalDescription(o); fetch(`${SIGNAL_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomIdRef.current, sender_id: authUser!.user_id, target_id: targetId, signal_type: "offer", payload: o }) }); });
    return pc;
  }, [authUser]);

  const startCall = async (mode: "video" | "screen") => {
    if (!authUser || !activeView) return;
    const stream = mode === "screen"
      ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    const roomId = getRoomId(activeView); roomIdRef.current = roomId;
    setInCall(true); setCallMode(mode);
    await fetch(`${SIGNAL_URL}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId, sender_id: authUser.user_id }) });
    lastSignalIdRef.current = 0;
    signalPollRef.current = setInterval(async () => {
      const res = await fetch(`${SIGNAL_URL}/poll?room_id=${roomId}&user_id=${authUser.user_id}&since_id=${lastSignalIdRef.current}`);
      const sigs = await res.json();
      for (const s of sigs) {
        lastSignalIdRef.current = Math.max(lastSignalIdRef.current, s.id);
        const st = localStreamRef.current; if (!st) continue;
        if (s.signal_type === "join") { if (!peerConnsRef.current[s.sender_id]) createPeer(s.sender_id, true, st); }
        else if (s.signal_type === "offer") {
          let pc = peerConnsRef.current[s.sender_id]; if (!pc) pc = createPeer(s.sender_id, false, st);
          await pc.setRemoteDescription(new RTCSessionDescription(s.payload));
          const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
          await fetch(`${SIGNAL_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId, sender_id: authUser.user_id, target_id: s.sender_id, signal_type: "answer", payload: ans }) });
        } else if (s.signal_type === "answer") { const pc = peerConnsRef.current[s.sender_id]; if (pc) await pc.setRemoteDescription(new RTCSessionDescription(s.payload)); }
        else if (s.signal_type === "ice") { const pc = peerConnsRef.current[s.sender_id]; if (pc) await pc.addIceCandidate(new RTCIceCandidate(s.payload)); }
        else if (s.signal_type === "leave") { peerConnsRef.current[s.sender_id]?.close(); delete peerConnsRef.current[s.sender_id]; setRemoteStreams(prev => prev.filter(r => r.userId !== s.sender_id)); }
      }
    }, 1500);
  };

  const stopCall = useCallback(async () => {
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
    Object.values(peerConnsRef.current).forEach(pc => pc.close()); peerConnsRef.current = {};
    setRemoteStreams([]); setInCall(false); setCallMode(null);
    if (authUser && roomIdRef.current) await fetch(`${SIGNAL_URL}/leave`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomIdRef.current, sender_id: authUser.user_id }) });
  }, [authUser]);

  const toggleMic = () => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicOn(p => !p); };
  const toggleVideo = () => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setVideoOn(p => !p); };

  // ─── EFFECTS ────────────────────────────────────────────
  useEffect(() => { if (authUser) { loadFriends(); loadChannels(); } }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    const iv = setInterval(async () => {
      const view = activeChatRef.current; if (!view) return;
      let res: Response;
      if (view.type === "dm") res = await fetch(`${MESSAGES_URL}/history?user_id=${authUser.user_id}&friend_id=${view.friend.user.id}`);
      else res = await fetch(`${CHANNELS_URL}/history?channel_id=${view.channel.id}`);
      const data: Message[] = await res.json();
      if (data.length !== lastMsgCountRef.current) { lastMsgCountRef.current = data.length; setMessages(data); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80); }
    }, 3000);
    return () => clearInterval(iv);
  }, [authUser]);

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ru", { day: "numeric", month: "long" });

  const acceptedFriends = friends.filter(f => f.status === "accepted");
  const pendingIn = friends.filter(f => f.status === "pending" && f.direction === "received");
  const pendingOut = friends.filter(f => f.status === "pending" && f.direction === "sent");

  const groupedChannels = channels.reduce<Record<string, Channel[]>>((acc, ch) => {
    const cat = ch.category || "Основное";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ch); return acc;
  }, {});

  // ─── AUTH PAGE ──────────────────────────────────────────
  if (!authUser) return (
    <div className="min-h-screen bg-[#0f130f] flex overflow-hidden">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#141914] to-[#0a0d0a] flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "repeating-linear-gradient(0deg,#4a7c4a 0,#4a7c4a 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,#4a7c4a 0,#4a7c4a 1px,transparent 1px,transparent 48px)" }} />
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#4a7c4a] opacity-10 rounded-full" />
        <div className="absolute -bottom-16 -right-16 w-72 h-72 bg-[#4a7c4a] opacity-10 rounded-full" />
        <div className="relative z-10 text-center max-w-md">
          <div className="w-24 h-24 bg-[#4a7c4a] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-[#4a7c4a]/20">
            <Radio className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-6xl font-black text-white mb-3 tracking-tight">Link</h1>
          <p className="text-[#6a9e6a] text-xl mb-12">Защищённый мессенджер для военных</p>
          <div className="space-y-5 text-left">
            {[
              { icon: <Lock className="w-5 h-5" />, title: "Военное шифрование", desc: "AES-256 на всех каналах" },
              { icon: <Hash className="w-5 h-5" />, title: "Закрытые каналы", desc: "Доступ только по приглашению" },
              { icon: <Monitor className="w-5 h-5" />, title: "Трансляции и демо экрана", desc: "WebRTC видеосвязь в реальном времени" },
              { icon: <Users className="w-5 h-5" />, title: "Личные чаты и каналы", desc: "Полная структура как в Discord" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#1f2b1f] border border-[#2a4a2a] rounded-xl flex items-center justify-center text-[#4a7c4a] flex-shrink-0">{f.icon}</div>
                <div><div className="text-white text-sm font-semibold">{f.title}</div><div className="text-[#5a7a5a] text-xs">{f.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#4a7c4a] rounded-xl flex items-center justify-center"><Radio className="w-5 h-5 text-white" /></div>
          <h1 className="text-2xl font-black text-white">Link</h1>
        </div>
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-white text-3xl font-bold mb-2">{authMode === "login" ? "С возвращением" : "Создать аккаунт"}</h2>
            <p className="text-[#5a7a5a]">{authMode === "login" ? "Войдите в защищённый контур Link" : "Зарегистрируйтесь для доступа"}</p>
          </div>
          <div className="flex bg-[#141914] border border-[#1e2b1e] rounded-2xl p-1 mb-6">
            {(["login", "register"] as const).map(m => (
              <button key={m} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${authMode === m ? "bg-[#4a7c4a] text-white shadow-lg" : "text-[#5a7a5a] hover:text-white"}`} onClick={() => { setAuthMode(m); setAuthError(""); }}>
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === "register" && (
              <div>
                <label className="text-[#6a9a6a] text-xs font-bold uppercase tracking-wider block mb-2">Имя и фамилия</label>
                <input className="w-full bg-[#141914] border border-[#1e2b1e] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#3a5a3a] focus:outline-none focus:border-[#4a7c4a] focus:ring-1 focus:ring-[#4a7c4a]/50 transition-all" placeholder="Иванов Иван" value={authForm.display_name} onChange={e => setAuthForm({ ...authForm, display_name: e.target.value })} required />
              </div>
            )}
            <div>
              <label className="text-[#6a9a6a] text-xs font-bold uppercase tracking-wider block mb-2">Позывной</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a7c4a] font-bold text-sm">@</span>
                <input className="w-full bg-[#141914] border border-[#1e2b1e] rounded-xl pl-9 pr-4 py-3.5 text-white text-sm placeholder-[#3a5a3a] focus:outline-none focus:border-[#4a7c4a] focus:ring-1 focus:ring-[#4a7c4a]/50 transition-all" placeholder="pozyvnoy" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value.toLowerCase().replace(/\s/g, "") })} required />
              </div>
            </div>
            <div>
              <label className="text-[#6a9a6a] text-xs font-bold uppercase tracking-wider block mb-2">Пароль</label>
              <input type="password" className="w-full bg-[#141914] border border-[#1e2b1e] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#3a5a3a] focus:outline-none focus:border-[#4a7c4a] focus:ring-1 focus:ring-[#4a7c4a]/50 transition-all" placeholder={authMode === "register" ? "Минимум 6 символов" : "Введите пароль"} value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} required />
            </div>
            {authError && (
              <div className="bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
                <Shield className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{authError}</p>
              </div>
            )}
            <Button type="submit" disabled={authLoading} className="w-full bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white py-4 rounded-xl font-bold text-sm transition-all duration-200 shadow-lg shadow-[#4a7c4a]/20">
              {authLoading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Подключение...</span> : authMode === "login" ? "Войти в Link" : "Создать аккаунт"}
            </Button>
          </form>
          <div className="text-center mt-5 text-[#3a5a3a] text-sm">
            {authMode === "login" ? <span>Нет аккаунта? <button className="text-[#4a7c4a] hover:text-[#6ab06a] font-semibold" onClick={() => { setAuthMode("register"); setAuthError(""); }}>Зарегистрироваться</button></span> : <span>Есть аккаунт? <button className="text-[#4a7c4a] hover:text-[#6ab06a] font-semibold" onClick={() => { setAuthMode("login"); setAuthError(""); }}>Войти</button></span>}
          </div>
          <div className="flex items-center justify-center gap-2 mt-6 text-[#2a4a2a] text-xs"><Lock className="w-3 h-3" /><span>Защищено военным стандартом шифрования</span></div>
        </div>
      </div>
    </div>
  );

  // ─── MAIN APP ────────────────────────────────────────────
  return (
    <div className="h-screen bg-[#1e2124] text-white flex flex-col overflow-hidden">

      {/* ── PWA Install Banner ── */}
      {showInstallBanner && (
        <div className="flex-shrink-0 bg-[#4a7c4a] px-4 py-2 flex items-center gap-3 z-50">
          <img src="https://cdn.poehali.dev/projects/fbc019b6-e074-4ec4-8ec0-9ecf64c38e80/files/967c26eb-7f20-4ce3-9ca9-d1b0725114be.jpg" className="w-8 h-8 rounded-lg flex-shrink-0" alt="Link" />
          <span className="flex-1 text-white text-sm font-medium">Установить Link как приложение на Android</span>
          <button onClick={handleInstall} className="bg-white text-[#4a7c4a] px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors flex-shrink-0">Установить</button>
          <button onClick={() => setShowInstallBanner(false)} className="text-white/70 hover:text-white ml-1 flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
      {/* ── Серверная панель (левая колонка иконок) ── */}
      <div className="w-[72px] bg-[#1a1d21] flex flex-col items-center py-3 gap-2 flex-shrink-0 overflow-y-auto">
        <button className="w-12 h-12 bg-[#4a7c4a] hover:bg-[#5a8c5a] rounded-2xl hover:rounded-xl transition-all duration-200 flex items-center justify-center shadow-lg group" title="Link — Главная">
          <Radio className="w-6 h-6 text-white" />
        </button>
        <div className="w-8 h-px bg-[#2a2d31] my-1" />
        {/* Иконки каналов */}
        {channels.slice(0, 6).map(ch => (
          <button key={ch.id} onClick={() => { setTab("channels"); openView({ type: "channel", channel: ch }); }} title={ch.name}
            className={`w-12 h-12 rounded-3xl hover:rounded-xl transition-all duration-200 flex items-center justify-center text-sm font-bold ${activeView?.type === "channel" && activeView.channel.id === ch.id ? "bg-[#4a7c4a] text-white rounded-xl" : "bg-[#2a2d31] text-[#8a9e8a] hover:bg-[#4a7c4a] hover:text-white"}`}>
            {ch.name[0].toUpperCase()}
          </button>
        ))}
        <button onClick={() => { setTab("channels"); setShowCreateChannel(true); }} title="Добавить канал"
          className="w-12 h-12 bg-[#2a2d31] hover:bg-[#4a7c4a] rounded-3xl hover:rounded-xl transition-all duration-200 flex items-center justify-center text-[#4a7c4a] hover:text-white">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* ── Левая панель ── */}
      <div className={`${mobileSidebarOpen ? "absolute inset-y-0 left-[72px] z-50" : "hidden"} sm:flex w-60 bg-[#2b2d31] flex-col flex-shrink-0`}>

        {/* Заголовок панели */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e2124] shadow-sm">
          <span className="text-white font-bold text-sm truncate">{tab === "friends" ? "Личные сообщения" : "Каналы"}</span>
          <div className="flex gap-1">
            <button onClick={() => setTab("friends")} className={`p-1.5 rounded transition-colors ${tab === "friends" ? "text-white" : "text-[#8a9e8a] hover:text-white"}`} title="Личные сообщения"><Users className="w-4 h-4" /></button>
            <button onClick={() => setTab("channels")} className={`p-1.5 rounded transition-colors ${tab === "channels" ? "text-white" : "text-[#8a9e8a] hover:text-white"}`} title="Каналы"><Hash className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">

          {/* ── FRIENDS TAB ── */}
          {tab === "friends" && (
            <>
              <button onClick={() => openView(null)} className="w-full flex items-center gap-3 px-2 py-2 rounded text-[#8a9e8a] hover:text-white hover:bg-[#35373c] transition-colors mb-1">
                <Users className="w-4 h-4" /><span className="text-sm font-medium">Друзья</span>
                {pendingIn.length > 0 && <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{pendingIn.length}</span>}
              </button>

              {/* Добавить друга */}
              <button onClick={() => setShowAddFriend(!showAddFriend)} className="w-full flex items-center gap-3 px-2 py-2 rounded text-[#8a9e8a] hover:text-white hover:bg-[#35373c] transition-colors mb-3">
                <UserPlus className="w-4 h-4" /><span className="text-sm font-medium">Добавить друга</span>
              </button>

              {showAddFriend && (
                <div className="mb-3 space-y-2">
                  <div className="flex gap-1">
                    <input className="flex-1 bg-[#1e2124] rounded px-3 py-2 text-white text-xs placeholder-[#5a6a5a] focus:outline-none focus:ring-1 focus:ring-[#4a7c4a]" placeholder="@позывной" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
                    <button onClick={handleSearch} className="bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white px-3 rounded text-xs">Найти</button>
                  </div>
                  {searchResults.map(u => (
                    <div key={u.id} className="flex items-center gap-2 p-2 bg-[#35373c] rounded">
                      <Avatar name={u.display_name} color={u.avatar_color} size={7} />
                      <div className="flex-1 min-w-0"><div className="text-white text-xs font-medium truncate">{u.display_name}</div><div className="text-[#5a7a5a] text-xs">@{u.username}</div></div>
                      <button onClick={() => sendFriendReq(u.id)} className="text-[#4a7c4a] hover:text-[#6a9c6a]"><UserPlus className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Ожидающие */}
              {pendingIn.length > 0 && (
                <>
                  <div className="text-[#5a7a5a] text-xs font-bold uppercase tracking-wider px-2 mb-1">Запросы — {pendingIn.length}</div>
                  {pendingIn.map(f => (
                    <div key={f.friendship_id} className="flex items-center gap-2 p-2 rounded hover:bg-[#35373c] group">
                      <Avatar name={f.user.display_name} color={f.user.avatar_color} size={8} />
                      <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{f.user.display_name}</div><div className="text-[#5a7a5a] text-xs">Входящий запрос</div></div>
                      <button onClick={() => acceptFriend(f.friendship_id)} className="w-7 h-7 bg-[#4a7c4a] hover:bg-[#5a8c5a] rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-white" /></button>
                    </div>
                  ))}
                  <div className="h-px bg-[#1e2124] my-2" />
                </>
              )}

              {/* Друзья */}
              {acceptedFriends.length > 0 && <div className="text-[#5a7a5a] text-xs font-bold uppercase tracking-wider px-2 mb-1">Личные сообщения — {acceptedFriends.length}</div>}
              {acceptedFriends.map(f => (
                <button key={f.friendship_id} onClick={() => openView({ type: "dm", friend: f })} className={`w-full flex items-center gap-3 p-2 rounded transition-colors ${activeView?.type === "dm" && activeView.friend.friendship_id === f.friendship_id ? "bg-[#35373c] text-white" : "text-[#8a9e8a] hover:text-white hover:bg-[#35373c]"}`}>
                  <Avatar name={f.user.display_name} color={f.user.avatar_color} size={8} status={f.user.status || "online"} />
                  <div className="flex-1 min-w-0 text-left"><div className="text-white text-sm font-medium truncate">{f.user.display_name}</div><div className="text-[#5a7a5a] text-xs truncate">@{f.user.username}</div></div>
                </button>
              ))}
              {acceptedFriends.length === 0 && pendingIn.length === 0 && !showAddFriend && (
                <div className="text-center text-[#5a7a5a] text-xs py-6 px-4"><Users className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Добавьте первого друга</p></div>
              )}
            </>
          )}

          {/* ── CHANNELS TAB ── */}
          {tab === "channels" && (
            <>
              <div className="flex gap-1 mb-3">
                <button onClick={() => setShowCreateChannel(!showCreateChannel)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-[#4a7c4a] hover:bg-[#5a8c5a] rounded text-white text-xs font-semibold transition-colors"><Plus className="w-3 h-3" />Создать</button>
                <button onClick={() => setShowJoin(!showJoin)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-[#35373c] hover:bg-[#3d4044] rounded text-[#8a9e8a] hover:text-white text-xs font-semibold transition-colors">Войти по коду</button>
              </div>
              {showCreateChannel && (
                <form onSubmit={createChannel} className="mb-3 space-y-2 p-2 bg-[#1e2124] rounded-lg">
                  <input className="w-full bg-[#2b2d31] rounded px-3 py-2 text-white text-xs placeholder-[#5a6a5a] focus:outline-none focus:ring-1 focus:ring-[#4a7c4a]" placeholder="# название-канала" value={channelForm.name} onChange={e => setChannelForm({ ...channelForm, name: e.target.value.toLowerCase().replace(/\s/g, "-") })} />
                  <select className="w-full bg-[#2b2d31] rounded px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#4a7c4a]" value={channelForm.type} onChange={e => setChannelForm({ ...channelForm, type: e.target.value })}>
                    <option value="text">Текстовый канал</option>
                    <option value="voice">Голосовой канал</option>
                  </select>
                  <button type="submit" className="w-full bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white py-2 rounded text-xs font-semibold">Создать</button>
                </form>
              )}
              {showJoin && (
                <form onSubmit={joinChannel} className="mb-3 flex gap-1">
                  <input className="flex-1 bg-[#1e2124] rounded px-3 py-2 text-white text-xs placeholder-[#5a6a5a] focus:outline-none focus:ring-1 focus:ring-[#4a7c4a]" placeholder="Код приглашения" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
                  <button type="submit" className="bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white px-3 rounded text-xs">OK</button>
                </form>
              )}

              {Object.entries(groupedChannels).map(([cat, chs]) => (
                <div key={cat} className="mb-2">
                  <button className="w-full flex items-center gap-1 px-1 py-1 text-[#5a7a5a] hover:text-[#8a9e8a] text-xs font-bold uppercase tracking-wider transition-colors" onClick={() => setCollapsedCategories(p => ({ ...p, [cat]: !p[cat] }))}>
                    {collapsedCategories[cat] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{cat}
                  </button>
                  {!collapsedCategories[cat] && chs.map(ch => (
                    <button key={ch.id} onClick={() => openView({ type: "channel", channel: ch })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors group ${activeView?.type === "channel" && activeView.channel.id === ch.id ? "bg-[#35373c] text-white" : "text-[#8a9e8a] hover:text-white hover:bg-[#35373c]"}`}>
                      {ch.type === "voice" ? <Volume2 className="w-4 h-4 flex-shrink-0" /> : <Hash className="w-4 h-4 flex-shrink-0" />}
                      <span className="text-sm truncate">{ch.name}</span>
                      <span className="ml-auto text-[#5a7a5a] text-xs opacity-0 group-hover:opacity-100">{ch.member_count}</span>
                    </button>
                  ))}
                </div>
              ))}
              {channels.length === 0 && <div className="text-center text-[#5a7a5a] text-xs py-6"><Hash className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Нет каналов</p></div>}
            </>
          )}
        </div>

        {/* User panel */}
        <div className="h-14 bg-[#232428] px-2 flex items-center gap-2 flex-shrink-0">
          <div className="relative cursor-pointer" onClick={() => setShowSettings(!showSettings)}>
            <Avatar name={authUser.display_name} color={authUser.avatar_color} size={9} status={authUser.status} />
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowSettings(!showSettings)}>
            <div className="text-white text-sm font-semibold truncate">{authUser.display_name}</div>
            <div className="text-[#5a7a5a] text-xs">@{authUser.username}</div>
          </div>
          <div className="flex gap-1">
            <button onClick={toggleMic} className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${micOn ? "text-[#8a9e8a] hover:text-white hover:bg-[#35373c]" : "text-red-400 hover:bg-[#35373c]"}`} title={micOn ? "Выключить микрофон" : "Включить микрофон"}>{micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}</button>
            <button onClick={() => setDeafened(p => !p)} className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${!deafened ? "text-[#8a9e8a] hover:text-white hover:bg-[#35373c]" : "text-red-400 hover:bg-[#35373c]"}`} title={deafened ? "Включить звук" : "Выключить звук"}>{deafened ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}</button>
            <button onClick={() => setShowSettings(!showSettings)} className="w-8 h-8 rounded flex items-center justify-center text-[#8a9e8a] hover:text-white hover:bg-[#35373c] transition-colors" title="Настройки"><Settings className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Settings popup */}
        {showSettings && (
          <div className="absolute bottom-16 left-2 w-56 bg-[#111214] border border-[#2a2d31] rounded-xl shadow-2xl p-2 z-50">
            <div className="px-2 py-1.5 mb-1">
              <div className="text-white text-sm font-semibold">{authUser.display_name}</div>
              <div className="text-[#5a7a5a] text-xs">@{authUser.username}</div>
            </div>
            <div className="h-px bg-[#2a2d31] mb-1" />
            <div className="text-[#5a7a5a] text-xs font-bold uppercase tracking-wider px-2 mb-1">Статус</div>
            {[{ v: "online", label: "В сети", color: "bg-green-500" }, { v: "idle", label: "Отошёл", color: "bg-yellow-500" }, { v: "dnd", label: "Не беспокоить", color: "bg-red-500" }, { v: "offline", label: "Не видим", color: "bg-gray-500" }].map(s => (
              <button key={s.v} onClick={() => { updateStatus(s.v); setShowSettings(false); }} className={`w-full flex items-center gap-2 px-2 py-2 rounded text-sm hover:bg-[#35373c] transition-colors ${authUser.status === s.v ? "text-white" : "text-[#8a9e8a]"}`}>
                <span className={`w-3 h-3 ${s.color} rounded-full flex-shrink-0`} />{s.label}
                {authUser.status === s.v && <Check className="w-3 h-3 ml-auto text-[#4a7c4a]" />}
              </button>
            ))}
            <div className="h-px bg-[#2a2d31] my-1" />
            <button onClick={logout} className="w-full flex items-center gap-2 px-2 py-2 rounded text-sm text-red-400 hover:bg-[#35373c] transition-colors"><LogOut className="w-4 h-4" />Выйти</button>
          </div>
        )}
      </div>

      {/* ── Основная область ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Заголовок чата */}
        {activeView ? (
          <div className="h-12 bg-[#313338] border-b border-[#1e2124] flex items-center px-4 gap-3 flex-shrink-0 shadow-sm">
            <button className="sm:hidden text-[#8a9e8a] hover:text-white mr-2" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}><Menu className="w-5 h-5" /></button>
            {activeView.type === "dm" ? (
              <>
                <Avatar name={activeView.friend.user.display_name} color={activeView.friend.user.avatar_color} size={8} status={activeView.friend.user.status} />
                <div><span className="text-white font-semibold text-sm">{activeView.friend.user.display_name}</span><span className="text-[#5a7a5a] text-xs ml-2">@{activeView.friend.user.username}</span></div>
              </>
            ) : (
              <>
                {activeView.channel.type === "voice" ? <Volume2 className="w-5 h-5 text-[#5a7a5a]" /> : <Hash className="w-5 h-5 text-[#5a7a5a]" />}
                <span className="text-white font-semibold text-sm">{activeView.channel.name}</span>
                {activeView.channel.description && <span className="text-[#5a7a5a] text-xs hidden md:block">— {activeView.channel.description}</span>}
                <div className="h-5 w-px bg-[#3a3d42] mx-1 hidden md:block" />
                <button onClick={() => copyCode(activeView.channel.invite_code)} className="hidden md:flex items-center gap-1 text-[#5a7a5a] hover:text-[#8a9e8a] text-xs transition-colors" title="Скопировать код приглашения">
                  <Copy className="w-3 h-3" />{copiedCode ? "Скопировано!" : activeView.channel.invite_code}
                </button>
              </>
            )}
            <div className="ml-auto flex items-center gap-1">
              {!inCall ? (
                <>
                  <button onClick={() => startCall("video")} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white rounded text-xs font-semibold transition-colors" title="Видеозвонок">
                    <Video className="w-3.5 h-3.5" /><span className="hidden sm:inline">Видео</span>
                  </button>
                  <button onClick={() => startCall("screen")} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#35373c] hover:bg-[#3d4044] text-[#8a9e8a] hover:text-white rounded text-xs font-semibold transition-colors" title="Демонстрация экрана">
                    <Monitor className="w-3.5 h-3.5" /><span className="hidden sm:inline">Экран</span>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={toggleMic} className={`w-8 h-8 rounded flex items-center justify-center ${micOn ? "text-[#8a9e8a] hover:bg-[#35373c]" : "text-red-400 bg-red-900/30"}`}>{micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}</button>
                  {callMode === "video" && <button onClick={toggleVideo} className={`w-8 h-8 rounded flex items-center justify-center ${videoOn ? "text-[#8a9e8a] hover:bg-[#35373c]" : "text-red-400 bg-red-900/30"}`}>{videoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}</button>}
                  <button onClick={stopCall} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold transition-colors"><PhoneOff className="w-3.5 h-3.5" /><span className="hidden sm:inline">Завершить</span></button>
                </>
              )}
              <div className="flex items-center gap-1 text-[#4a7c4a] text-xs ml-2 hidden lg:flex">
                <Shield className="w-3 h-3" /><span>E2E</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-12 bg-[#313338] border-b border-[#1e2124] flex items-center px-4 gap-3 flex-shrink-0">
            <button className="sm:hidden text-[#8a9e8a] hover:text-white mr-2" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}><Menu className="w-5 h-5" /></button>
            <Users className="w-5 h-5 text-[#5a7a5a]" />
            <span className="text-white font-semibold text-sm">Друзья</span>
          </div>
        )}

        {/* Видео-область */}
        {inCall && (
          <div className="bg-[#111214] border-b border-[#1e2124] p-3 flex gap-3 flex-wrap flex-shrink-0">
            <div className="relative">
              <video ref={localVideoRef} autoPlay muted playsInline className="w-44 h-32 object-cover rounded-xl bg-[#1e2124] border border-[#2a2d31]" />
              <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                {callMode === "screen" ? <Monitor className="w-3 h-3" /> : <Video className="w-3 h-3" />} Вы
              </div>
            </div>
            {remoteStreams.map(rs => (
              <div key={rs.userId} className="relative">
                <video autoPlay playsInline className="w-44 h-32 object-cover rounded-xl bg-[#1e2124] border border-[#2a2d31]" ref={el => { if (el) el.srcObject = rs.stream; }} />
                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">{rs.display_name}</div>
              </div>
            ))}
            {remoteStreams.length === 0 && (
              <div className="flex items-center gap-2 text-[#5a7a5a] text-sm self-center px-2"><Tv2 className="w-4 h-4" />Ожидание участников...</div>
            )}
          </div>
        )}

        {/* Messages / Welcome */}
        {activeView ? (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  {activeView.type === "dm" ? <Avatar name={activeView.friend.user.display_name} color={activeView.friend.user.avatar_color} size={16} /> : <div className="w-16 h-16 bg-[#4a7c4a] rounded-full flex items-center justify-center mb-2"><Hash className="w-8 h-8 text-white" /></div>}
                  <h3 className="text-white text-2xl font-bold mt-4 mb-1">{activeView.type === "dm" ? activeView.friend.user.display_name : `#${activeView.channel.name}`}</h3>
                  <p className="text-[#5a7a5a] text-sm">{activeView.type === "dm" ? `Начало истории переписки с @${activeView.friend.user.username}` : "Начало канала — напишите первое сообщение!"}</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const prev = messages[i - 1];
                const sameAuthor = prev && prev.sender_id === msg.sender_id && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
                const isMe = msg.sender_id === authUser.user_id;
                return (
                  <div key={msg.id} className={`flex gap-4 group hover:bg-[#2e3035] px-2 py-0.5 rounded transition-colors ${!sameAuthor ? "mt-4" : ""}`} onMouseEnter={() => setHoveredMsg(msg.id)} onMouseLeave={() => setHoveredMsg(null)}>
                    <div className="w-10 flex-shrink-0 flex items-start justify-center mt-0.5">
                      {!sameAuthor ? <Avatar name={msg.display_name} size={10} color={isMe ? authUser.avatar_color : "#6a7a6a"} /> : <span className="text-[#4a5a4a] text-xs opacity-0 group-hover:opacity-100 mt-1">{fmtTime(msg.created_at)}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      {!sameAuthor && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className={`font-semibold text-sm ${isMe ? "text-[#6ab06a]" : "text-white"}`}>{msg.display_name}</span>
                          <span className="text-[#4a5a4a] text-xs">{fmtTime(msg.created_at)}</span>
                        </div>
                      )}
                      <p className="text-[#dcddde] text-sm leading-relaxed break-words">{msg.content}</p>
                    </div>
                    {hoveredMsg === msg.id && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity items-start pt-0.5">
                        {EMOJIS.slice(0, 3).map(e => <button key={e} className="text-sm hover:scale-125 transition-transform">{e}</button>)}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="px-4 pb-4 flex-shrink-0">
              <div className="flex items-center gap-3 bg-[#383a40] rounded-xl px-4 py-3">
                <input
                  className="flex-1 bg-transparent text-[#dcddde] text-sm placeholder-[#5a6a5a] focus:outline-none"
                  placeholder={activeView.type === "dm" ? `Написать @${activeView.friend.user.username}...` : `Написать в #${activeView.channel.name}...`}
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                />
                <button type="button" className="text-[#5a7a5a] hover:text-[#8a9e8a] transition-colors"><Smile className="w-5 h-5" /></button>
                <button type="submit" disabled={sendingMsg || !messageText.trim()} className="text-[#4a7c4a] hover:text-[#6a9c6a] disabled:opacity-30 transition-colors"><Send className="w-5 h-5" /></button>
              </div>
            </form>
          </>
        ) : (
          /* Экран друзей */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <div className="flex gap-2 mb-6">
                {(["all", "pending", "add"] as const).map(t => (
                  <button key={t} onClick={() => setFriendsTab(t)} className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${friendsTab === t ? "bg-[#35373c] text-white" : "text-[#8a9e8a] hover:bg-[#35373c] hover:text-white"}`}>
                    {t === "all" ? "Все" : t === "pending" ? `Ожидающие${pendingIn.length ? ` (${pendingIn.length})` : ""}` : "Добавить друга"}
                  </button>
                ))}
              </div>

              {friendsTab === "add" && (
                <div className="bg-[#2b2d31] rounded-xl p-6">
                  <h3 className="text-white font-bold mb-1">Добавить друга</h3>
                  <p className="text-[#5a7a5a] text-sm mb-4">Введите позывной пользователя для отправки запроса в друзья.</p>
                  <div className="flex gap-3">
                    <div className="flex-1 bg-[#1e2124] rounded-lg px-4 py-3 flex items-center gap-2">
                      <span className="text-[#4a7c4a] font-bold">@</span>
                      <input className="flex-1 bg-transparent text-white text-sm placeholder-[#5a6a5a] focus:outline-none" placeholder="позывной" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
                    </div>
                    <button onClick={handleSearch} className="bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white px-5 rounded-lg text-sm font-semibold transition-colors">Найти</button>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {searchResults.map(u => (
                        <div key={u.id} className="flex items-center gap-3 p-3 bg-[#1e2124] rounded-lg">
                          <Avatar name={u.display_name} color={u.avatar_color} size={10} />
                          <div className="flex-1"><div className="text-white font-semibold text-sm">{u.display_name}</div><div className="text-[#5a7a5a] text-xs">@{u.username}</div></div>
                          <button onClick={() => sendFriendReq(u.id)} className="bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">Добавить</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {friendsTab === "all" && (
                <div>
                  <div className="text-[#5a7a5a] text-xs font-bold uppercase tracking-wider mb-3">Все друзья — {acceptedFriends.length}</div>
                  {acceptedFriends.length === 0 ? (
                    <div className="text-center py-16 text-[#5a7a5a]"><Users className="w-16 h-16 mx-auto mb-4 opacity-20" /><p className="text-lg font-semibold text-[#3a4a3a]">Список друзей пуст</p><p className="text-sm mt-1">Найдите сослуживцев по позывному</p></div>
                  ) : acceptedFriends.map(f => (
                    <div key={f.friendship_id} className="flex items-center gap-3 p-3 hover:bg-[#35373c] rounded-xl transition-colors group">
                      <Avatar name={f.user.display_name} color={f.user.avatar_color} size={10} status={f.user.status || "online"} />
                      <div className="flex-1 min-w-0"><div className="text-white font-semibold text-sm">{f.user.display_name}</div><div className="text-[#5a7a5a] text-xs">@{f.user.username}</div></div>
                      <button onClick={() => openView({ type: "dm", friend: f })} className="opacity-0 group-hover:opacity-100 bg-[#35373c] hover:bg-[#3d4044] text-[#8a9e8a] hover:text-white p-2 rounded-full transition-all"><Send className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {friendsTab === "pending" && (
                <div>
                  <div className="text-[#5a7a5a] text-xs font-bold uppercase tracking-wider mb-3">Входящие — {pendingIn.length}</div>
                  {pendingIn.length === 0 ? <p className="text-[#5a7a5a] text-sm py-8 text-center">Нет входящих запросов</p> : pendingIn.map(f => (
                    <div key={f.friendship_id} className="flex items-center gap-3 p-3 hover:bg-[#35373c] rounded-xl transition-colors">
                      <Avatar name={f.user.display_name} color={f.user.avatar_color} size={10} />
                      <div className="flex-1"><div className="text-white font-semibold text-sm">{f.user.display_name}</div><div className="text-[#5a7a5a] text-xs">Входящий запрос в друзья</div></div>
                      <button onClick={() => acceptFriend(f.friendship_id)} className="bg-[#4a7c4a] hover:bg-[#5a8c5a] text-white p-2 rounded-full transition-colors"><Check className="w-4 h-4" /></button>
                    </div>
                  ))}
                  {pendingOut.length > 0 && (
                    <>
                      <div className="text-[#5a7a5a] text-xs font-bold uppercase tracking-wider mt-6 mb-3">Исходящие — {pendingOut.length}</div>
                      {pendingOut.map(f => (
                        <div key={f.friendship_id} className="flex items-center gap-3 p-3 hover:bg-[#35373c] rounded-xl transition-colors">
                          <Avatar name={f.user.display_name} color={f.user.avatar_color} size={10} />
                          <div className="flex-1"><div className="text-white font-semibold text-sm">{f.user.display_name}</div><div className="text-[#5a7a5a] text-xs">Запрос отправлен</div></div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Мобильный оверлей */}
      {mobileSidebarOpen && <div className="sm:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileSidebarOpen(false)} />}
      </div>
    </div>
  );
}