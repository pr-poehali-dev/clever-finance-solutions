import { useState } from "react";
import {
  Download,
  Shield,
  Zap,
  Lock,
  Clock,
  Radio,
  ArrowRight,
  Hash,
  Users,
  Mic,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#1a1f1a] text-white overflow-x-hidden">
      {/* Навигация */}
      <nav className="bg-[#141914] border-b border-[#0a0d0a] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#4a7c4a] rounded-full flex items-center justify-center">
              <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white">ТАКТИК</h1>
              <p className="text-xs text-[#8a9e8a] hidden sm:block">Защищённый мессенджер для военных</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <Button variant="ghost" className="text-[#8a9e8a] hover:text-white hover:bg-[#2a332a]">
              <Shield className="w-4 h-4 mr-2" />
              О безопасности
            </Button>
            <Button className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-6 py-2 rounded text-sm font-medium">
              Подключиться
            </Button>
          </div>
          <Button
            variant="ghost"
            className="sm:hidden text-[#8a9e8a] hover:text-white hover:bg-[#2a332a] p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {mobileMenuOpen && (
          <div className="sm:hidden mt-4 pt-4 border-t border-[#0a0d0a]">
            <div className="flex flex-col gap-3">
              <Button variant="ghost" className="text-[#8a9e8a] hover:text-white hover:bg-[#2a332a] justify-start">
                <Shield className="w-4 h-4 mr-2" />
                О безопасности
              </Button>
              <Button className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-6 py-2 rounded text-sm font-medium">
                Подключиться
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Макет в стиле мессенджера */}
      <div className="flex min-h-screen">
        {/* Боковая панель серверов */}
        <div className="hidden lg:flex w-[72px] bg-[#0f130f] flex-col items-center py-3 gap-2">
          <div className="w-12 h-12 bg-[#4a7c4a] rounded-2xl hover:rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <div className="w-8 h-[2px] bg-[#1a1f1a] rounded-full"></div>
          {["ШТ", "АР", "РЗВ", "ОП"].map((unit, i) => (
            <div
              key={i}
              className="w-12 h-12 bg-[#1a1f1a] rounded-3xl hover:rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer hover:bg-[#4a7c4a]"
            >
              <span className="text-[#8a9e8a] text-xs font-bold">{unit}</span>
            </div>
          ))}
        </div>

        {/* Основной контент */}
        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Боковая панель каналов */}
          <div
            className={`${mobileSidebarOpen ? "block" : "hidden"} lg:block w-full lg:w-60 bg-[#141914] flex flex-col`}
          >
            <div className="p-4 border-b border-[#0a0d0a] flex items-center justify-between">
              <h2 className="text-white font-semibold text-base">ТАКТИК — Штаб</h2>
              <Button
                variant="ghost"
                className="lg:hidden text-[#8a9e8a] hover:text-white hover:bg-[#2a332a] p-1"
                onClick={() => setMobileSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 p-2">
              <div className="mb-4">
                <div className="flex items-center gap-1 px-2 py-1 text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide">
                  <ArrowRight className="w-3 h-3" />
                  <span>Текстовые каналы</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {["общий", "оперативный", "снабжение", "связь"].map((channel) => (
                    <div
                      key={channel}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-[#5a7a5a] hover:text-[#b0c4b0] hover:bg-[#1f261f] cursor-pointer"
                    >
                      <Hash className="w-4 h-4" />
                      <span className="text-sm">{channel}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 px-2 py-1 text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide">
                  <ArrowRight className="w-3 h-3" />
                  <span>Голосовые каналы</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {["Командный пункт", "Оперативный штаб"].map((channel) => (
                    <div
                      key={channel}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-[#5a7a5a] hover:text-[#b0c4b0] hover:bg-[#1f261f] cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      <span className="text-sm">{channel}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Область пользователя */}
            <div className="p-2 bg-[#0f130f] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#4a7c4a] rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">К</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">Командир</div>
                <div className="text-[#8a9e8a] text-xs truncate">Защищённый сеанс</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0 hover:bg-[#2a332a]">
                  <Mic className="w-4 h-4 text-[#8a9e8a]" />
                </Button>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0 hover:bg-[#2a332a]">
                  <Settings className="w-4 h-4 text-[#8a9e8a]" />
                </Button>
              </div>
            </div>
          </div>

          {/* Область чата */}
          <div className="flex-1 flex flex-col">
            {/* Заголовок чата */}
            <div className="h-12 bg-[#1a1f1a] border-b border-[#0a0d0a] flex items-center px-4 gap-2">
              <Button
                variant="ghost"
                className="lg:hidden text-[#5a7a5a] hover:text-[#b0c4b0] hover:bg-[#2a332a] p-1 mr-2"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <Hash className="w-5 h-5 text-[#5a7a5a]" />
              <span className="text-white font-semibold">оперативный</span>
              <div className="w-px h-6 bg-[#2a332a] mx-2 hidden sm:block"></div>
              <span className="text-[#5a7a5a] text-sm hidden sm:block">Защищённый канал связи</span>
              <div className="ml-auto flex items-center gap-2 sm:gap-4">
                <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-[#8a9e8a] cursor-pointer hover:text-[#b0c4b0]" />
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#8a9e8a] cursor-pointer hover:text-[#b0c4b0]" />
                <Search className="w-4 h-4 sm:w-5 sm:h-5 text-[#8a9e8a] cursor-pointer hover:text-[#b0c4b0]" />
              </div>
            </div>

            {/* Сообщения чата */}
            <div className="flex-1 p-2 sm:p-4 space-y-4 sm:space-y-6 overflow-y-auto">
              {/* Приветственное сообщение от системы */}
              <div className="flex gap-2 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#4a7c4a] rounded-full flex items-center justify-center flex-shrink-0">
                  <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white font-medium text-sm sm:text-base">ТАКТИК Система</span>
                    <span className="bg-[#4a7c4a] text-white text-xs px-1 rounded">СИСТЕМА</span>
                    <span className="text-[#5a7a5a] text-xs hidden sm:inline">Сегодня в 00:00</span>
                  </div>
                  <div className="text-[#b0c4b0] text-sm sm:text-base">
                    <p className="mb-3 sm:mb-4">
                      <strong>Добро пожаловать в ТАКТИК!</strong> Защищённый мессенджер для координации и оперативной связи.
                    </p>
                    <div className="bg-[#141914] border-l-4 border-[#4a7c4a] p-3 sm:p-4 rounded">
                      <h3 className="text-white font-semibold mb-2 text-sm sm:text-base">Возможности ТАКТИК:</h3>
                      <ul className="space-y-1 text-xs sm:text-sm text-[#8a9e8a]">
                        <li>Сквозное шифрование всех сообщений и файлов</li>
                        <li>Голосовая и видеосвязь с защитой канала</li>
                        <li>Обмен координатами и тактическими картами</li>
                        <li>Работа в условиях ограниченного интернета</li>
                        <li>Иерархия доступа по уровням допуска</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Сообщение пользователя */}
              <div className="flex gap-2 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-green-700 to-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs sm:text-sm font-medium">А</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white font-medium text-sm sm:text-base">Майор Алексеев</span>
                    <span className="text-[#5a7a5a] text-xs hidden sm:inline">Сегодня в 06:14</span>
                  </div>
                  <div className="text-[#b0c4b0] mb-3 text-sm sm:text-base">
                    Выходим на связь. Группа прибыла на точку. Ожидаем подтверждения.
                  </div>

                  {/* Демо профиля пользователя */}
                  <div className="bg-[#141914] border border-[#0a0d0a] rounded-lg overflow-hidden w-full max-w-sm">
                    <div className="h-16 sm:h-20 bg-gradient-to-r from-[#2a4a2a] to-[#1a3a1a] relative">
                      <div className="absolute -bottom-3 sm:-bottom-4 left-3 sm:left-4">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-[#141914] bg-[#1a1f1a] overflow-hidden relative">
                          <div className="w-full h-full bg-gradient-to-br from-[#3a6a3a] to-[#2a4a2a] flex items-center justify-center">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#141914] rounded-full flex items-center justify-center">
                              <span className="text-lg sm:text-2xl">А</span>
                            </div>
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 bg-[#4a7c4a] border-4 border-[#141914] rounded-full"></div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="absolute top-2 sm:top-4 right-2 sm:right-4 bg-[#2a332a] hover:bg-[#3a463a] text-white text-xs px-2 sm:px-3 py-1 rounded"
                      >
                        <Settings className="w-3 h-3 mr-1" />
                        <span className="hidden sm:inline">Профиль</span>
                      </Button>
                    </div>

                    <div className="pt-4 sm:pt-6 px-3 sm:px-4 pb-3 sm:pb-4">
                      <div className="mb-3 sm:mb-4">
                        <h3 className="text-white text-lg sm:text-xl font-bold mb-1">Майор Алексеев</h3>
                        <div className="flex items-center gap-2 text-[#8a9e8a] text-xs sm:text-sm">
                          <span>alekseev_cmd</span>
                          <span>-</span>
                          <span>Оперативный доступ</span>
                          <div className="flex gap-1 ml-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#4a7c4a] rounded-sm"></div>
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#6a5a2a] rounded-sm"></div>
                          </div>
                        </div>
                      </div>

                      <div className="mb-3 sm:mb-4">
                        <div className="bg-[#1a1f1a] rounded-lg p-2 sm:p-3 relative">
                          <div className="absolute -top-2 left-3 sm:left-4 w-4 h-4 bg-[#1a1f1a] rotate-45"></div>
                          <div className="flex items-center gap-2 text-[#b0c4b0] text-xs sm:text-sm">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#4a7c4a] rounded-full flex items-center justify-center">
                              <span className="text-xs">✓</span>
                            </div>
                            <span>На боевом дежурстве</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex border-b border-[#2a332a] mb-3 sm:mb-4">
                        <button className="px-3 sm:px-4 py-2 text-[#5a7a5a] text-xs sm:text-sm font-medium hover:text-[#b0c4b0]">
                          Сведения
                        </button>
                        <button className="px-3 sm:px-4 py-2 text-white text-xs sm:text-sm font-medium border-b-2 border-[#4a7c4a]">
                          Статус
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide mb-2 sm:mb-3">
                          <span>Активность</span>
                        </div>

                        <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-[#1a1f1a] rounded-lg">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-[#3a6a3a] to-[#2a4a2a] rounded-lg flex items-center justify-center flex-shrink-0">
                            <Radio className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-white font-semibold text-xs sm:text-sm mb-1">ТАКТИК</div>
                            <div className="text-[#b0c4b0] text-xs sm:text-sm mb-1">Оперативный канал</div>
                            <div className="text-[#8a9e8a] text-xs sm:text-sm mb-2">Шифрование активно</div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-[#4a7c4a] rounded-full animate-pulse"></div>
                              <span className="text-[#4a7c4a] text-xs font-medium">На связи</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ещё одно сообщение */}
              <div className="flex gap-2 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-yellow-700 to-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs sm:text-sm font-medium">С</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white font-medium text-sm sm:text-base">Сержант Иванов</span>
                    <span className="text-[#5a7a5a] text-xs hidden sm:inline">Сегодня в 06:17</span>
                  </div>
                  <div className="text-[#b0c4b0] text-sm sm:text-base">
                    Принял. Маршрут согласован, связь устойчивая. ТАКТИК работает даже в зоне с плохим сигналом.
                  </div>
                </div>
              </div>

              {/* Секция "Начало работы" */}
              <div className="bg-[#141914] border border-[#0a0d0a] rounded-lg p-4 sm:p-6 mt-6 sm:mt-8">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <Download className="w-5 h-5 sm:w-6 sm:h-6 text-[#4a7c4a]" />
                  Подключиться к ТАКТИК
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
                  <div className="text-center">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#4a7c4a] rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold text-sm sm:text-base">1</span>
                    </div>
                    <h3 className="text-white font-medium mb-2 text-sm sm:text-base">Получить доступ</h3>
                    <p className="text-[#8a9e8a] text-xs sm:text-sm">Оставьте заявку — мы свяжемся и выдадим защищённые учётные данные</p>
                  </div>
                  <div className="text-center">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#4a7c4a] rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold text-sm sm:text-base">2</span>
                    </div>
                    <h3 className="text-white font-medium mb-2 text-sm sm:text-base">Установить приложение</h3>
                    <p className="text-[#8a9e8a] text-xs sm:text-sm">Доступно для iOS, Android, Windows и Linux</p>
                  </div>
                  <div className="text-center">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#4a7c4a] rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold text-sm sm:text-base">3</span>
                    </div>
                    <h3 className="text-white font-medium mb-2 text-sm sm:text-base">Выйти на связь</h3>
                    <p className="text-[#8a9e8a] text-xs sm:text-sm">Добавляйте бойцов и создавайте защищённые группы</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button className="bg-[#4a7c4a] hover:bg-[#3a6a3a] text-white px-6 sm:px-8 py-2 sm:py-3 rounded text-sm font-medium">
                    <Download className="w-4 h-4 mr-2" />
                    Оставить заявку
                  </Button>
                  <Button
                    variant="outline"
                    className="border-[#2a4a2a] text-[#8a9e8a] hover:bg-[#2a332a] hover:border-[#4a6a4a] px-6 sm:px-8 py-2 sm:py-3 rounded text-sm font-medium bg-transparent"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    О безопасности
                  </Button>
                </div>
              </div>

              {/* Преимущества */}
              <div className="bg-[#141914] border border-[#0a0d0a] rounded-lg p-4 sm:p-6">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-4">Почему ТАКТИК?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {[
                    {
                      icon: <Lock className="w-4 h-4 sm:w-5 sm:h-5" />,
                      title: "Сквозное шифрование",
                      desc: "Военный стандарт AES-256, никто не перехватит",
                    },
                    {
                      icon: <Wifi className="w-4 h-4 sm:w-5 sm:h-5" />,
                      title: "Работа офлайн",
                      desc: "Mesh-сеть между устройствами без интернета",
                    },
                    {
                      icon: <Clock className="w-4 h-4 sm:w-5 sm:h-5" />,
                      title: "Связь 24/7",
                      desc: "Серверы в защищённой инфраструктуре",
                    },
                    {
                      icon: <Zap className="w-4 h-4 sm:w-5 sm:h-5" />,
                      title: "Мгновенная доставка",
                      desc: "Сообщения доходят даже при слабом сигнале",
                    },
                  ].map((feature, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded hover:bg-[#1a1f1a] transition-colors"
                    >
                      <div className="text-[#4a7c4a] mt-0.5">{feature.icon}</div>
                      <div>
                        <div className="text-white font-medium text-xs sm:text-sm">{feature.title}</div>
                        <div className="text-[#8a9e8a] text-xs sm:text-sm">{feature.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Поле ввода сообщения */}
            <div className="p-2 sm:p-4">
              <div className="bg-[#2a332a] rounded-lg px-3 sm:px-4 py-2 sm:py-3">
                <div className="text-[#5a7a5a] text-xs sm:text-sm">Сообщение #оперативный (шифрование активно)</div>
              </div>
            </div>
          </div>

          {/* Боковая панель участников */}
          <div className="hidden xl:block w-60 bg-[#141914] p-4">
            <div className="mb-4">
              <h3 className="text-[#5a7a5a] text-xs font-semibold uppercase tracking-wide mb-2">На связи — 3</h3>
              <div className="space-y-2">
                {[
                  {
                    name: "Майор Алексеев",
                    status: "Оперативный канал",
                    avatar: "А",
                    color: "from-green-700 to-green-500",
                  },
                  { name: "Сержант Иванов", status: "На дежурстве", avatar: "С", color: "from-yellow-700 to-yellow-500" },
                  { name: "Командир", status: "Разворачивает ТАКТИК", avatar: "К", color: "from-green-800 to-green-600" },
                ].map((user, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 rounded hover:bg-[#1a1f1a] cursor-pointer">
                    <div
                      className={`w-8 h-8 bg-gradient-to-r ${user.color} rounded-full flex items-center justify-center relative`}
                    >
                      <span className="text-white text-sm font-medium">{user.avatar}</span>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#4a7c4a] border-2 border-[#141914] rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{user.name}</div>
                      <div className="text-[#8a9e8a] text-xs truncate">{user.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
