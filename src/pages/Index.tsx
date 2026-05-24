import { useState, useEffect, useRef } from "react";
import {
  Shield,
  Radio,
  Hash,
  Users,
  Mic,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  Send,
  UserPlus,
  Check,
  LogOut,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/9f1f6cd4-ef39-4d6c-8aa9-a3b0fa392d42";
const FRIENDS_URL = "https://functions.poehali.dev/c818513e-108b-491b-be7a-8ae1d7792675";
const MESSAGES_URL = "https://functions.poehali.dev/edca8417-913a-4596-b3b6-60b77e61e61d";

interface User {
  user_id: number;
  username: string;
  display_name: string;
  token: string;
}

interface Friend {
  friendship_id: number;
  status: string;
  direction: string;
  user: { id: number; username: string; display_name: string };
}

interface Message {
  id: number;
  sender_id: number;
  content: string;
  created_at: string;
  display_name: string;
}

export default function Index() {
  const [authUser, setAuthUser] = useState<User | null>(() => {
    const s = localStorage.getItem("link_user");
    return s ? JSON.parse(s) : null;
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ username: "", display_name: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; username: string; display_name: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);

  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  const activeChatRef = useRef<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const lastMessageCountRef = useRef(0);
  const [messageText, setMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const saveUser = (u: User) => {
    setAuthUser(u);
    localStorage.setItem("link_user", JSON.stringify(u));
  };

  const logout = () => {
    setAuthUser(null);
    localStorage.removeItem("link_user");
    setFriends([]);
    setActiveChat(null);
    setMessages([]);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    const path = authMode === "login" ? "/login" : "/register";
    const body: Record<string, string> = { username: authForm.username, password: authForm.password };
    if (authMode === "register") body.display_name = authForm.display_name;
    const res = await fetch(`${AUTH_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setAuthLoading(false);
    if (!res.ok) { setAuthError(data.error || "Ошибка"); return; }
    saveUser(data);
  };

  const loadFriends = async () => {
    if (!authUser) return;
    const res = await fetch(`${FRIENDS_URL}/list?user_id=${authUser.user_id}`);
    const data = await res.json();
    setFriends(data);
  };

  useEffect(() => {
    if (authUser) loadFriends();
  }, [authUser]);

  // Автообновление чата каждые 3 секунды
  useEffect(() => {
    if (!authUser) return;
    const interval = setInterval(async () => {
      const chat = activeChatRef.current;
      if (!chat) return;
      const friendId = chat.user.id;
      const res = await fetch(`${MESSAGES_URL}/history?user_id=${authUser.user_id}&friend_id=${friendId}`);
      const data: Message[] = await res.json();
      if (data.length !== lastMessageCountRef.current) {
        lastMessageCountRef.current = data.length;
        setMessages(data);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [authUser]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !authUser) return;
    setSearchLoading(true);
    const res = await fetch(`${FRIENDS_URL}/search?q=${encodeURIComponent(searchQuery)}&user_id=${authUser.user_id}`);
    const data = await res.json();
    setSearchResults(data);
    setSearchLoading(false);
  };

  const sendFriendRequest = async (targetId: number) => {
    if (!authUser) return;
    await fetch(`${FRIENDS_URL}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: authUser.user_id, target_id: targetId }),
    });
    setSearchResults([]);
    setSearchQuery("");
    setShowAddFriend(false);
    loadFriends();
  };

  const acceptFriend = async (friendshipId: number) => {
    if (!authUser) return;
    await fetch(`${FRIENDS_URL}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: authUser.user_id, friendship_id: friendshipId }),
    });
    loadFriends();
  };

  const openChat = async (friend: Friend) => {
    setActiveChat(friend);
    activeChatRef.current = friend;
    setMobileSidebarOpen(false);
    if (!authUser) return;
    const friendId = friend.user.id;
    const res = await fetch(`${MESSAGES_URL}/history?user_id=${authUser.user_id}&friend_id=${friendId}`);
    const data: Message[] = await res.json();
    lastMessageCountRef.current = data.length;
    setMessages(data);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !authUser || !activeChat) return;
    setSendingMsg(true);
    const friendId = activeChat.user.id;
    const res = await fetch(`${MESSAGES_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender_id: authUser.user_id, receiver_id: friendId, content: messageText }),
    });
    if (res.ok) {
      setMessageText("");
      const histRes = await fetch(`${MESSAGES_URL}/history?user_id=${authUser.user_id}&friend_id=${friendId}`);
      setMessages(await histRes.json());
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
    setSendingMsg(false);
  };

  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const pendingIncoming = friends.filter((f) => f.status === "pending" && f.direction === "received");

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  };

  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#1a1f1a] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-[#4a7c4a] rounded-full flex items-center justify-center">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">Link</h1>
          </div>

          <div className="bg-[#141914] border border-[#0a0d0a] rounded-xl p-6">
            <div className="flex gap-2 mb-6">
              <button
                className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${authMode === "login" ? "bg-[#4a7c4a] text-white" : "text-[#8a9e8a] hover:text-white"}`}
                onClick={() => setAuthMode("login")}
              >
                Вход
              </button>
              <button
                className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${authMode === "register" ? "bg-[#4a7c4a] text-white" : "text-[#8a9e8a] hover:text-white"}`}
                onClick={() => setAuthMode("register")}
              >
                Регистрация
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === "register" && (
                <div>
                  <label className="text-[#8a9e8a] text-xs font-semibold uppercase tracking-wide block mb-1">Имя</label>
                  <input
                    className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#4a7c4a]"
                    placeholder="Ваше имя"
                    value={authForm.display_name}
                    onChange={(e) => setAuthForm({ ...authForm, display_name: e.target.value })}
                  />
                </div>
              )}
              <div>
                <label className="text-[#8a9e8a] text-xs font-semibold uppercase tracking-wide block mb-1">Никнейм</label>
                <input
                  className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#4a7c4a]"
                  placeholder="@никнейм"
                  value={authForm.username}
                  onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[#8a9e8a] text-xs font-semibold uppercase tracking-wide block mb-1">Пароль</label>
                <input
                  type="password"
                  className="w-full bg-[#0f130f] border border-[#2a332a] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#4a7c4a]"
                  placeholder="••••••••"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                />
              </div>
              {authError && <p className="text-red-400 text-sm">{authError}</p>}
              <Button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white py-2 rounded font-medium"
              >
                {authLoading ? "..." : authMode === "login" ? "Войти" : "Создать аккаунт"}
              </Button>
            </form>

            <div className="flex items-center gap-2 mt-4 text-[#5a7a5a] text-xs">
              <Lock className="w-3 h-3" />
              <span>Защищённое соединение</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1f1a] text-white overflow-x-hidden">
      <nav className="bg-[#141914] border-b border-[#0a0d0a] px-4 sm:px-6 py-3">
        <div className="max-w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#4a7c4a] rounded-full flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white">Link</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#8a9e8a] text-sm hidden sm:block">{authUser.display_name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#8a9e8a] hover:text-white hover:bg-[#2a332a] p-2"
              onClick={logout}
            >
              <LogOut className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              className="sm:hidden text-[#8a9e8a] hover:text-white hover:bg-[#2a332a] p-2"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            >
              {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </nav>

      <div className="flex" style={{ height: "calc(100vh - 57px)" }}>
        {/* Сайдбар с контактами */}
        <div
          className={`${mobileSidebarOpen ? "absolute z-50 inset-0 top-[57px]" : "hidden"} sm:relative sm:flex w-full sm:w-72 bg-[#141914] flex-col border-r border-[#0a0d0a]`}
        >
          <div className="p-3 border-b border-[#0a0d0a]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide">Контакты</span>
              <Button
                variant="ghost"
                size="sm"
                className="w-7 h-7 p-0 text-[#8a9e8a] hover:text-white hover:bg-[#2a332a]"
                onClick={() => setShowAddFriend(!showAddFriend)}
                title="Добавить контакт"
              >
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>

            {showAddFriend && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-[#0f130f] border border-[#2a332a] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-[#4a7c4a]"
                    placeholder="Поиск по @никнейму"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button
                    size="sm"
                    className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-3"
                    onClick={handleSearch}
                    disabled={searchLoading}
                  >
                    <Search className="w-3 h-3" />
                  </Button>
                </div>
                {searchResults.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 p-2 bg-[#1a1f1a] rounded">
                    <div className="w-7 h-7 bg-[#2a4a2a] rounded-full flex items-center justify-center text-xs font-bold text-white">
                      {u.display_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium truncate">{u.display_name}</div>
                      <div className="text-[#5a7a5a] text-xs">@{u.username}</div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-2 py-1 text-xs"
                      onClick={() => sendFriendRequest(u.id)}
                    >
                      <UserPlus className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {pendingIncoming.length > 0 && (
              <div className="mb-2">
                <div className="text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide px-2 mb-1">
                  Запросы ({pendingIncoming.length})
                </div>
                {pendingIncoming.map((f) => (
                  <div key={f.friendship_id} className="flex items-center gap-2 p-2 rounded bg-[#1f261f]">
                    <div className="w-8 h-8 bg-[#2a4a2a] rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                      {f.user.display_name?.[0] || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{f.user.display_name}</div>
                      <div className="text-[#5a7a5a] text-xs">@{f.user.username}</div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white w-7 h-7 p-0"
                      onClick={() => acceptFriend(f.friendship_id)}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {acceptedFriends.length === 0 && pendingIncoming.length === 0 && (
              <div className="text-center text-[#5a7a5a] text-sm py-8 px-4">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Нет контактов</p>
                <p className="text-xs mt-1">Нажмите + чтобы найти бойцов</p>
              </div>
            )}

            {acceptedFriends.map((f) => (
              <div
                key={f.friendship_id}
                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                  activeChat?.friendship_id === f.friendship_id ? "bg-[#2a332a]" : "hover:bg-[#1f261f]"
                }`}
                onClick={() => openChat(f)}
              >
                <div className="w-9 h-9 bg-gradient-to-br from-green-700 to-green-500 rounded-full flex items-center justify-center text-sm font-bold text-white relative flex-shrink-0">
                  {f.user.display_name?.[0] || "?"}
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#4a7c4a] border-2 border-[#141914] rounded-full"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{f.user.display_name}</div>
                  <div className="text-[#5a7a5a] text-xs truncate">@{f.user.username}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2 bg-[#0f130f] flex items-center gap-2 border-t border-[#0a0d0a]">
            <div className="w-8 h-8 bg-[#4a7c4a] rounded-full flex items-center justify-center text-sm font-bold text-white">
              {authUser.display_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{authUser.display_name}</div>
              <div className="text-[#5a7a5a] text-xs">@{authUser.username}</div>
            </div>
          </div>
        </div>

        {/* Область чата */}
        <div className="flex-1 flex flex-col">
          {activeChat ? (
            <>
              <div className="h-12 bg-[#1a1f1a] border-b border-[#0a0d0a] flex items-center px-4 gap-3">
                <Button
                  variant="ghost"
                  className="sm:hidden text-[#5a7a5a] hover:text-white hover:bg-[#2a332a] p-1 mr-1"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </Button>
                <div className="w-8 h-8 bg-gradient-to-br from-green-700 to-green-500 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {activeChat.user.display_name?.[0]}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{activeChat.user.display_name}</div>
                  <div className="text-[#5a7a5a] text-xs">@{activeChat.user.username}</div>
                </div>
                <div className="ml-auto flex items-center gap-1 text-[#4a7c4a] text-xs">
                  <Shield className="w-3 h-3" />
                  <span className="hidden sm:inline">Шифрование активно</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-[#5a7a5a] text-sm py-12">
                    <Lock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>Начните защищённый диалог</p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === authUser.user_id;
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                          isMe ? "bg-[#4a7c4a]" : "bg-gradient-to-br from-green-700 to-green-500"
                        }`}
                      >
                        {msg.display_name[0]}
                      </div>
                      <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                        <div className="flex items-baseline gap-2 mb-1">
                          {!isMe && <span className="text-white text-xs font-medium">{msg.display_name}</span>}
                          <span className="text-[#5a7a5a] text-xs">{formatTime(msg.created_at)}</span>
                        </div>
                        <div
                          className={`rounded-lg px-3 py-2 text-sm ${
                            isMe ? "bg-[#2a4a2a] text-white" : "bg-[#141914] text-[#b0c4b0]"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="p-3 border-t border-[#0a0d0a]">
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-[#2a332a] rounded-lg px-4 py-2 text-white text-sm placeholder-[#5a7a5a] focus:outline-none focus:ring-1 focus:ring-[#4a7c4a]"
                    placeholder={`Сообщение ${activeChat.user.display_name}...`}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={sendingMsg || !messageText.trim()}
                    className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-4 py-2 rounded-lg"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Button
                variant="ghost"
                className="sm:hidden absolute top-16 left-4 text-[#5a7a5a] hover:text-white hover:bg-[#2a332a] p-2"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div className="w-20 h-20 bg-[#141914] rounded-full flex items-center justify-center mb-4">
                <Radio className="w-10 h-10 text-[#4a7c4a]" />
              </div>
              <h2 className="text-white text-xl font-bold mb-2">Link</h2>
              <p className="text-[#5a7a5a] text-sm max-w-sm">
                Выберите контакт слева, чтобы начать защищённый диалог
              </p>
              <div className="flex items-center gap-2 mt-4 text-[#4a7c4a] text-xs">
                <Shield className="w-3 h-3" />
                <span>Все сообщения защищены шифрованием</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}