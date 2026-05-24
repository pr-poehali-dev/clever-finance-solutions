import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, Radio, Users, Mic, MicOff, Settings, Search,
  Menu, X, Send, UserPlus, Check, LogOut, Lock,
  Video, VideoOff, Monitor, MonitorOff, Hash,
  Plus, Copy, PhoneCall, PhoneOff, Tv2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const AUTH_URL    = "https://functions.poehali.dev/9f1f6cd4-ef39-4d6c-8aa9-a3b0fa392d42";
const FRIENDS_URL = "https://functions.poehali.dev/c818513e-108b-491b-be7a-8ae1d7792675";
const MESSAGES_URL= "https://functions.poehali.dev/edca8417-913a-4596-b3b6-60b77e61e61d";
const CHANNELS_URL= "https://functions.poehali.dev/f35d98d7-e2b9-449e-9290-47e0fd517ec0";
const SIGNAL_URL  = "https://functions.poehali.dev/5f7bfb3f-7664-4e1e-aa94-20af798645a7";

const ICE_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

interface AuthUser { user_id: number; username: string; display_name: string; token: string; }
interface Friend { friendship_id: number; status: string; direction: string; user: { id: number; username: string; display_name: string }; }
interface Message { id: number; sender_id: number; content: string; created_at: string; display_name: string; }
interface Channel { id: number; name: string; description: string; invite_code: string; owner_id: number; member_count: number; }

type Tab = "chats" | "channels";
type ChatView = { type: "dm"; friend: Friend } | { type: "channel"; channel: Channel } | null;

export default function Index() {
  // Auth
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const s = localStorage.getItem("link_user"); return s ? JSON.parse(s) : null;
  });
  const [authMode, setAuthMode] = useState<"login"|"register">("login");
  const [authForm, setAuthForm] = useState({ username: "", display_name: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Navigation
  const [tab, setTab] = useState<Tab>("chats");
  const [activeView, setActiveView] = useState<ChatView>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Friends
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; username: string; display_name: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);

  // Channels
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: "", description: "" });
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgCountRef = useRef(0);
  const activeChatRef = useRef<ChatView>(null);

  // WebRTC
  const [inCall, setInCall] = useState(false);
  const [callMode, setCallMode] = useState<"video"|"screen"|null>(null);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState<{ userId: number; stream: MediaStream; display_name: string }[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnsRef = useRef<Record<number, RTCPeerConnection>>({});
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSignalIdRef = useRef(0);
  const roomIdRef = useRef<string>("");

  // ---------- AUTH ----------
  const saveUser = (u: AuthUser) => { setAuthUser(u); localStorage.setItem("link_user", JSON.stringify(u)); };
  const logout = () => {
    stopCall();
    setAuthUser(null); localStorage.removeItem("link_user");
    setFriends([]); setChannels([]); setActiveView(null); setMessages([]);
  };
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError(""); setAuthLoading(true);
    const path = authMode === "login" ? "/login" : "/register";
    const body: Record<string,string> = { username: authForm.username, password: authForm.password };
    if (authMode === "register") body.display_name = authForm.display_name;
    const res = await fetch(`${AUTH_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json(); setAuthLoading(false);
    if (!res.ok) { setAuthError(data.error || "Ошибка"); return; }
    saveUser(data);
  };

  // ---------- FRIENDS ----------
  const loadFriends = useCallback(async () => {
    if (!authUser) return;
    const res = await fetch(`${FRIENDS_URL}/list?user_id=${authUser.user_id}`);
    setFriends(await res.json());
  }, [authUser]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !authUser) return;
    setSearchLoading(true);
    const res = await fetch(`${FRIENDS_URL}/search?q=${encodeURIComponent(searchQuery)}&user_id=${authUser.user_id}`);
    setSearchResults(await res.json()); setSearchLoading(false);
  };
  const sendFriendReq = async (targetId: number) => {
    if (!authUser) return;
    await fetch(`${FRIENDS_URL}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, target_id: targetId }) });
    setSearchResults([]); setSearchQuery(""); setShowAddFriend(false); loadFriends();
  };
  const acceptFriend = async (fid: number) => {
    if (!authUser) return;
    await fetch(`${FRIENDS_URL}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, friendship_id: fid }) });
    loadFriends();
  };

  // ---------- CHANNELS ----------
  const loadChannels = useCallback(async () => {
    if (!authUser) return;
    const res = await fetch(`${CHANNELS_URL}/list?user_id=${authUser.user_id}`);
    setChannels(await res.json());
  }, [authUser]);

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault(); if (!authUser || !channelForm.name.trim()) return;
    await fetch(`${CHANNELS_URL}/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, ...channelForm }) });
    setChannelForm({ name: "", description: "" }); setShowCreateChannel(false); loadChannels();
  };
  const joinChannel = async (e: React.FormEvent) => {
    e.preventDefault(); if (!authUser || !joinCode.trim()) return;
    await fetch(`${CHANNELS_URL}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: authUser.user_id, invite_code: joinCode }) });
    setJoinCode(""); setShowJoin(false); loadChannels();
  };
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000);
  };

  // ---------- MESSAGES ----------
  const loadMessages = useCallback(async (view: ChatView) => {
    if (!authUser || !view) return;
    let res: Response;
    if (view.type === "dm") {
      res = await fetch(`${MESSAGES_URL}/history?user_id=${authUser.user_id}&friend_id=${view.friend.user.id}`);
    } else {
      res = await fetch(`${CHANNELS_URL}/history?channel_id=${view.channel.id}`);
    }
    const data: Message[] = await res.json();
    lastMsgCountRef.current = data.length;
    setMessages(data);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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
    if (activeView.type === "dm") {
      await fetch(`${MESSAGES_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender_id: authUser.user_id, receiver_id: activeView.friend.user.id, content: messageText }) });
    } else {
      await fetch(`${CHANNELS_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel_id: activeView.channel.id, sender_id: authUser.user_id, content: messageText }) });
    }
    setMessageText(""); await loadMessages(activeView);
    setSendingMsg(false);
  };

  // ---------- WEBRTC ----------
  const getRoomId = (view: ChatView) => {
    if (!view) return "";
    if (view.type === "dm") return `dm_${Math.min(authUser!.user_id, view.friend.user.id)}_${Math.max(authUser!.user_id, view.friend.user.id)}`;
    return `ch_${view.channel.id}`;
  };

  const createPeer = useCallback((targetId: number, initiator: boolean, stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnsRef.current[targetId] = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      setRemoteStreams(prev => {
        const exists = prev.find(r => r.userId === targetId);
        if (exists) return prev.map(r => r.userId === targetId ? { ...r, stream: remoteStream } : r);
        return [...prev, { userId: targetId, stream: remoteStream, display_name: `Участник ${targetId}` }];
      });
    };

    pc.onicecandidate = async (e) => {
      if (!e.candidate || !authUser) return;
      await fetch(`${SIGNAL_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomIdRef.current, sender_id: authUser.user_id, target_id: targetId, signal_type: "ice", payload: e.candidate }) });
    };

    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        fetch(`${SIGNAL_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomIdRef.current, sender_id: authUser!.user_id, target_id: targetId, signal_type: "offer", payload: offer }) });
      });
    }
    return pc;
  }, [authUser]);

  const startCall = async (mode: "video" | "screen") => {
    if (!authUser || !activeView) return;
    let stream: MediaStream;
    if (mode === "screen") {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    localStreamRef.current = stream;
    if (localVideoRef.current) { localVideoRef.current.srcObject = stream; }
    const roomId = getRoomId(activeView);
    roomIdRef.current = roomId;
    setInCall(true); setCallMode(mode);

    await fetch(`${SIGNAL_URL}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId, sender_id: authUser.user_id }) });

    // Poll for signals
    lastSignalIdRef.current = 0;
    signalPollRef.current = setInterval(async () => {
      const res = await fetch(`${SIGNAL_URL}/poll?room_id=${roomId}&user_id=${authUser.user_id}&since_id=${lastSignalIdRef.current}`);
      const signals = await res.json();
      for (const sig of signals) {
        lastSignalIdRef.current = Math.max(lastSignalIdRef.current, sig.id);
        const stream = localStreamRef.current;
        if (!stream) continue;
        if (sig.signal_type === "join") {
          if (!peerConnsRef.current[sig.sender_id]) createPeer(sig.sender_id, true, stream);
        } else if (sig.signal_type === "offer") {
          let pc = peerConnsRef.current[sig.sender_id];
          if (!pc) pc = createPeer(sig.sender_id, false, stream);
          await pc.setRemoteDescription(new RTCSessionDescription(sig.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await fetch(`${SIGNAL_URL}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomId, sender_id: authUser.user_id, target_id: sig.sender_id, signal_type: "answer", payload: answer }) });
        } else if (sig.signal_type === "answer") {
          const pc = peerConnsRef.current[sig.sender_id];
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sig.payload));
        } else if (sig.signal_type === "ice") {
          const pc = peerConnsRef.current[sig.sender_id];
          if (pc) await pc.addIceCandidate(new RTCIceCandidate(sig.payload));
        } else if (sig.signal_type === "leave") {
          peerConnsRef.current[sig.sender_id]?.close();
          delete peerConnsRef.current[sig.sender_id];
          setRemoteStreams(prev => prev.filter(r => r.userId !== sig.sender_id));
        }
      }
    }, 1500);
  };

  const stopCall = useCallback(async () => {
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    Object.values(peerConnsRef.current).forEach(pc => pc.close());
    peerConnsRef.current = {};
    setRemoteStreams([]);
    setInCall(false); setCallMode(null);
    if (authUser && roomIdRef.current) {
      await fetch(`${SIGNAL_URL}/leave`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_id: roomIdRef.current, sender_id: authUser.user_id }) });
    }
  }, [authUser]);

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(p => !p);
  };
  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setVideoOn(p => !p);
  };

  // ---------- EFFECTS ----------
  useEffect(() => { if (authUser) { loadFriends(); loadChannels(); } }, [authUser]);

  // Auto-refresh messages
  useEffect(() => {
    if (!authUser) return;
    const iv = setInterval(async () => {
      const view = activeChatRef.current;
      if (!view) return;
      let res: Response;
      if (view.type === "dm") res = await fetch(`${MESSAGES_URL}/history?user_id=${authUser.user_id}&friend_id=${view.friend.user.id}`);
      else res = await fetch(`${CHANNELS_URL}/history?channel_id=${view.channel.id}`);
      const data: Message[] = await res.json();
      if (data.length !== lastMsgCountRef.current) {
        lastMsgCountRef.current = data.length;
        setMessages(data);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [authUser]);

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const acceptedFriends = friends.filter(f => f.status === "accepted");
  const pendingIn = friends.filter(f => f.status === "pending" && f.direction === "received");

  // ---------- AUTH SCREEN ----------
  if (!authUser) return (
    <div className="min-h-screen bg-[#1a1f1a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-[#4a7c4a] rounded-full flex items-center justify-center"><Radio className="w-6 h-6 text-white" /></div>
          <h1 className="text-3xl font-bold text-white">Link</h1>
        </div>
        <div className="bg-[#141914] border border-[#0a0d0a] rounded-xl p-6">
          <div className="flex gap-2 mb-6">
            {(["login","register"] as const).map(m => (
              <button key={m} className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${authMode === m ? "bg-[#4a7c4a] text-white" : "text-[#8a9e8a] hover:text-white"}`} onClick={() => setAuthMode(m)}>
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === "register" && (
              <div><label className="text-[#8a9e8a] text-xs font-semibold uppercase tracking-wide block mb-1">Имя</label>
                <input className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#4a7c4a]" placeholder="Ваше имя" value={authForm.display_name} onChange={e => setAuthForm({...authForm, display_name: e.target.value})} /></div>
            )}
            <div><label className="text-[#8a9e8a] text-xs font-semibold uppercase tracking-wide block mb-1">Никнейм</label>
              <input className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#4a7c4a]" placeholder="@никнейм" value={authForm.username} onChange={e => setAuthForm({...authForm, username: e.target.value})} /></div>
            <div><label className="text-[#8a9e8a] text-xs font-semibold uppercase tracking-wide block mb-1">Пароль</label>
              <input type="password" className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#4a7c4a]" placeholder="••••••••" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} /></div>
            {authError && <p className="text-red-400 text-sm">{authError}</p>}
            <Button type="submit" disabled={authLoading} className="w-full bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white py-2 rounded font-medium">
              {authLoading ? "..." : authMode === "login" ? "Войти" : "Создать аккаунт"}
            </Button>
          </form>
          <div className="flex items-center gap-2 mt-4 text-[#5a7a5a] text-xs"><Lock className="w-3 h-3" /><span>Защищённое соединение</span></div>
        </div>
      </div>
    </div>
  );

  // ---------- MAIN APP ----------
  return (
    <div className="min-h-screen bg-[#1a1f1a] text-white overflow-hidden flex flex-col">
      {/* Navbar */}
      <nav className="bg-[#141914] border-b border-[#0a0d0a] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#4a7c4a] rounded-full flex items-center justify-center"><Radio className="w-4 h-4 text-white" /></div>
          <h1 className="text-lg font-bold text-white">Link</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#8a9e8a] text-sm hidden sm:block">{authUser.display_name}</span>
          <Button variant="ghost" size="sm" className="text-[#8a9e8a] hover:text-white hover:bg-[#2a332a] p-2" onClick={logout}><LogOut className="w-4 h-4" /></Button>
          <Button variant="ghost" className="sm:hidden text-[#8a9e8a] hover:text-white hover:bg-[#2a332a] p-2" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
            {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${mobileSidebarOpen ? "absolute z-50 inset-0 top-[57px]" : "hidden"} sm:relative sm:flex w-full sm:w-72 bg-[#141914] flex-col border-r border-[#0a0d0a] flex-shrink-0`}>
          {/* Tabs */}
          <div className="flex border-b border-[#0a0d0a]">
            <button className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === "chats" ? "text-white border-b-2 border-[#4a7c4a]" : "text-[#5a7a5a] hover:text-white"}`} onClick={() => setTab("chats")}>
              <Users className="w-4 h-4" /> Чаты
            </button>
            <button className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === "channels" ? "text-white border-b-2 border-[#4a7c4a]" : "text-[#5a7a5a] hover:text-white"}`} onClick={() => setTab("channels")}>
              <Hash className="w-4 h-4" /> Каналы
            </button>
          </div>

          {/* CHATS TAB */}
          {tab === "chats" && (
            <>
              <div className="p-3 border-b border-[#0a0d0a]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide">Контакты</span>
                  <Button variant="ghost" size="sm" className="w-7 h-7 p-0 text-[#8a9e8a] hover:text-white hover:bg-[#2a332a]" onClick={() => setShowAddFriend(!showAddFriend)}><UserPlus className="w-4 h-4" /></Button>
                </div>
                {showAddFriend && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input className="flex-1 bg-[#0f130f] border border-[#2a332a] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-[#4a7c4a]" placeholder="@никнейм" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
                      <Button size="sm" className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-3" onClick={handleSearch} disabled={searchLoading}><Search className="w-3 h-3" /></Button>
                    </div>
                    {searchResults.map(u => (
                      <div key={u.id} className="flex items-center gap-2 p-2 bg-[#1a1f1a] rounded">
                        <div className="w-7 h-7 bg-[#2a4a2a] rounded-full flex items-center justify-center text-xs font-bold">{u.display_name[0]}</div>
                        <div className="flex-1 min-w-0"><div className="text-white text-xs font-medium truncate">{u.display_name}</div><div className="text-[#5a7a5a] text-xs">@{u.username}</div></div>
                        <Button size="sm" className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-2 py-1 text-xs" onClick={() => sendFriendReq(u.id)}><UserPlus className="w-3 h-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {pendingIn.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide px-2 mb-1">Запросы ({pendingIn.length})</div>
                    {pendingIn.map(f => (
                      <div key={f.friendship_id} className="flex items-center gap-2 p-2 rounded bg-[#1f261f]">
                        <div className="w-8 h-8 bg-[#2a4a2a] rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">{f.user.display_name?.[0]}</div>
                        <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{f.user.display_name}</div><div className="text-[#5a7a5a] text-xs">@{f.user.username}</div></div>
                        <Button size="sm" className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white w-7 h-7 p-0" onClick={() => acceptFriend(f.friendship_id)}><Check className="w-3 h-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                {acceptedFriends.length === 0 && pendingIn.length === 0 && (
                  <div className="text-center text-[#5a7a5a] text-sm py-8"><Users className="w-8 h-8 mx-auto mb-2 opacity-40" /><p>Нет контактов</p><p className="text-xs mt-1">Нажмите + чтобы добавить</p></div>
                )}
                {acceptedFriends.map(f => (
                  <div key={f.friendship_id} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${activeView?.type === "dm" && activeView.friend.friendship_id === f.friendship_id ? "bg-[#2a332a]" : "hover:bg-[#1f261f]"}`} onClick={() => openView({ type: "dm", friend: f })}>
                    <div className="w-9 h-9 bg-gradient-to-br from-green-700 to-green-500 rounded-full flex items-center justify-center text-sm font-bold relative flex-shrink-0">
                      {f.user.display_name?.[0]}
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#4a7c4a] border-2 border-[#141914] rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{f.user.display_name}</div><div className="text-[#5a7a5a] text-xs">@{f.user.username}</div></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* CHANNELS TAB */}
          {tab === "channels" && (
            <>
              <div className="p-3 border-b border-[#0a0d0a] space-y-2">
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white text-xs" onClick={() => { setShowCreateChannel(!showCreateChannel); setShowJoin(false); }}><Plus className="w-3 h-3 mr-1" />Создать</Button>
                  <Button size="sm" variant="outline" className="flex-1 border-[#2a4a2a] text-[#8a9e8a] hover:bg-[#2a332a] text-xs bg-transparent" onClick={() => { setShowJoin(!showJoin); setShowCreateChannel(false); }}>Вступить</Button>
                </div>
                {showCreateChannel && (
                  <form onSubmit={createChannel} className="space-y-2">
                    <input className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-[#4a7c4a]" placeholder="Название канала" value={channelForm.name} onChange={e => setChannelForm({...channelForm, name: e.target.value})} />
                    <input className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-[#4a7c4a]" placeholder="Описание (необязательно)" value={channelForm.description} onChange={e => setChannelForm({...channelForm, description: e.target.value})} />
                    <Button type="submit" size="sm" className="w-full bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white text-xs">Создать канал</Button>
                  </form>
                )}
                {showJoin && (
                  <form onSubmit={joinChannel} className="flex gap-2">
                    <input className="flex-1 bg-[#0f130f] border border-[#2a332a] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-[#4a7c4a]" placeholder="Код приглашения" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
                    <Button type="submit" size="sm" className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-3"><Check className="w-3 h-3" /></Button>
                  </form>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {channels.length === 0 && (
                  <div className="text-center text-[#5a7a5a] text-sm py-8"><Hash className="w-8 h-8 mx-auto mb-2 opacity-40" /><p>Нет каналов</p><p className="text-xs mt-1">Создайте или вступите по коду</p></div>
                )}
                {channels.map(ch => (
                  <div key={ch.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${activeView?.type === "channel" && activeView.channel.id === ch.id ? "bg-[#2a332a]" : "hover:bg-[#1f261f]"}`} onClick={() => openView({ type: "channel", channel: ch })}>
                    <div className="w-9 h-9 bg-[#2a4a2a] rounded-lg flex items-center justify-center flex-shrink-0"><Hash className="w-4 h-4 text-[#4a7c4a]" /></div>
                    <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{ch.name}</div><div className="text-[#5a7a5a] text-xs">{ch.member_count} участников</div></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* User panel */}
          <div className="p-2 bg-[#0f130f] flex items-center gap-2 border-t border-[#0a0d0a]">
            <div className="w-8 h-8 bg-[#4a7c4a] rounded-full flex items-center justify-center text-sm font-bold">{authUser.display_name[0]}</div>
            <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{authUser.display_name}</div><div className="text-[#5a7a5a] text-xs">@{authUser.username}</div></div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeView ? (
            <>
              {/* Chat header */}
              <div className="h-12 bg-[#1a1f1a] border-b border-[#0a0d0a] flex items-center px-4 gap-3 flex-shrink-0">
                <Button variant="ghost" className="sm:hidden text-[#5a7a5a] hover:text-white hover:bg-[#2a332a] p-1 mr-1" onClick={() => setMobileSidebarOpen(true)}><Menu className="w-5 h-5" /></Button>
                {activeView.type === "dm" ? (
                  <>
                    <div className="w-8 h-8 bg-gradient-to-br from-green-700 to-green-500 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">{activeView.friend.user.display_name?.[0]}</div>
                    <div><div className="text-white font-semibold text-sm">{activeView.friend.user.display_name}</div><div className="text-[#5a7a5a] text-xs">@{activeView.friend.user.username}</div></div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 bg-[#2a4a2a] rounded-lg flex items-center justify-center flex-shrink-0"><Hash className="w-4 h-4 text-[#4a7c4a]" /></div>
                    <div>
                      <div className="text-white font-semibold text-sm">{activeView.channel.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#5a7a5a] text-xs">{activeView.channel.member_count} участников</span>
                        <button className="text-[#5a7a5a] hover:text-[#8a9e8a] text-xs flex items-center gap-1" onClick={() => copyCode(activeView.channel.invite_code)}>
                          <Copy className="w-3 h-3" />{copiedCode ? "Скопировано!" : activeView.channel.invite_code}
                        </button>
                      </div>
                    </div>
                  </>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {!inCall ? (
                    <>
                      <Button size="sm" className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-3 py-1 text-xs flex items-center gap-1" onClick={() => startCall("video")}>
                        <Video className="w-3 h-3" /><span className="hidden sm:inline">Видео</span>
                      </Button>
                      <Button size="sm" className="bg-[#2a4a6a] hover:bg-[#1a3a5a] text-white px-3 py-1 text-xs flex items-center gap-1" onClick={() => startCall("screen")}>
                        <Monitor className="w-3 h-3" /><span className="hidden sm:inline">Экран</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" className={`w-8 h-8 p-0 ${micOn ? "text-white hover:bg-[#2a332a]" : "text-red-400 hover:bg-[#2a332a]"}`} onClick={toggleMic}>{micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}</Button>
                      {callMode === "video" && <Button size="sm" variant="ghost" className={`w-8 h-8 p-0 ${videoOn ? "text-white hover:bg-[#2a332a]" : "text-red-400 hover:bg-[#2a332a]"}`} onClick={toggleVideo}>{videoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}</Button>}
                      <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs flex items-center gap-1" onClick={stopCall}><PhoneOff className="w-3 h-3" /><span className="hidden sm:inline">Завершить</span></Button>
                    </>
                  )}
                  <div className="flex items-center gap-1 text-[#4a7c4a] text-xs hidden sm:flex"><Shield className="w-3 h-3" /><span>Шифрование</span></div>
                </div>
              </div>

              {/* Video area */}
              {inCall && (
                <div className="bg-[#0f130f] border-b border-[#0a0d0a] p-3 flex gap-3 flex-wrap flex-shrink-0">
                  <div className="relative">
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-40 h-28 object-cover rounded-lg bg-[#1a1f1a] border border-[#2a332a]" />
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded flex items-center gap-1">
                      {callMode === "screen" ? <Monitor className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                      Вы
                    </div>
                  </div>
                  {remoteStreams.map(rs => (
                    <div key={rs.userId} className="relative">
                      <video autoPlay playsInline className="w-40 h-28 object-cover rounded-lg bg-[#1a1f1a] border border-[#2a332a]"
                        ref={el => { if (el) el.srcObject = rs.stream; }} />
                      <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded">{rs.display_name}</div>
                    </div>
                  ))}
                  {remoteStreams.length === 0 && (
                    <div className="flex items-center gap-2 text-[#5a7a5a] text-sm px-2">
                      <Tv2 className="w-4 h-4" />
                      <span>Ожидание участников...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-[#5a7a5a] text-sm py-12"><Lock className="w-8 h-8 mx-auto mb-2 opacity-40" /><p>Начните защищённый диалог</p></div>
                )}
                {messages.map(msg => {
                  const isMe = msg.sender_id === authUser.user_id;
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isMe ? "bg-[#4a7c4a]" : "bg-gradient-to-br from-green-700 to-green-500"}`}>{msg.display_name[0]}</div>
                      <div className={`max-w-[70%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <div className="flex items-baseline gap-2 mb-1">
                          {!isMe && <span className="text-white text-xs font-medium">{msg.display_name}</span>}
                          <span className="text-[#5a7a5a] text-xs">{formatTime(msg.created_at)}</span>
                        </div>
                        <div className={`rounded-lg px-3 py-2 text-sm ${isMe ? "bg-[#2a4a2a] text-white" : "bg-[#141914] text-[#b0c4b0]"}`}>{msg.content}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} className="p-3 border-t border-[#0a0d0a] flex-shrink-0">
                <div className="flex gap-2">
                  <input className="flex-1 bg-[#2a332a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#5a7a5a] focus:outline-none focus:ring-1 focus:ring-[#4a7c4a]"
                    placeholder={activeView.type === "dm" ? `Сообщение ${activeView.friend.user.display_name}...` : `Сообщение в #${activeView.channel.name}...`}
                    value={messageText} onChange={e => setMessageText(e.target.value)} />
                  <Button type="submit" disabled={sendingMsg || !messageText.trim()} className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-4 py-2 rounded-lg"><Send className="w-4 h-4" /></Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Button variant="ghost" className="sm:hidden absolute top-16 left-4 text-[#5a7a5a] hover:text-white hover:bg-[#2a332a] p-2" onClick={() => setMobileSidebarOpen(true)}><Menu className="w-5 h-5" /></Button>
              <div className="w-20 h-20 bg-[#141914] rounded-full flex items-center justify-center mb-4"><Radio className="w-10 h-10 text-[#4a7c4a]" /></div>
              <h2 className="text-white text-xl font-bold mb-2">Link</h2>
              <p className="text-[#5a7a5a] text-sm max-w-sm mb-4">Выберите чат или канал, чтобы начать общение</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[{ icon: <Users className="w-5 h-5" />, label: "Личные чаты" }, { icon: <Hash className="w-5 h-5" />, label: "Каналы" }, { icon: <Monitor className="w-5 h-5" />, label: "Демо экрана" }].map((f, i) => (
                  <div key={i} className="bg-[#141914] rounded-lg p-3 flex flex-col items-center gap-2 text-[#5a7a5a]">
                    {f.icon}<span className="text-xs">{f.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-6 text-[#4a7c4a] text-xs"><Shield className="w-3 h-3" /><span>Все данные защищены шифрованием</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
