import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Send,
  Mic,
  MicOff,
  ImagePlus,
  Bot,
  MessageSquare,
  Loader2,
  X,
  PanelLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface TuckChat {
  id: number;
  clientId: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface TuckMessage {
  id: number;
  chatId: number;
  role: "user" | "assistant";
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

function ChatList({
  chats,
  activeChatId,
  onSelect,
  onDelete,
  onCreate,
  isCreating,
}: {
  chats: TuckChat[];
  activeChatId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onCreate: () => void;
  isCreating: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Button
          onClick={onCreate}
          disabled={isCreating}
          className="w-full bg-black text-white hover:bg-gray-800"
          size="sm"
          data-testid="button-new-chat"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {chats.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">
              No chats yet. Start a conversation!
            </p>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  "group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors",
                  activeChatId === chat.id
                    ? "bg-black text-white"
                    : "hover:bg-muted text-foreground"
                )}
                onClick={() => onSelect(chat.id)}
                data-testid={`chat-item-${chat.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                  <span className="text-xs truncate">{chat.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(chat.id);
                  }}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0 rounded p-0.5",
                    activeChatId === chat.id
                      ? "text-white/70 hover:text-red-300"
                      : "hover:text-red-500"
                  )}
                  data-testid={`button-delete-chat-${chat.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function TalkToTuckPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const { data: chats = [] } = useQuery<TuckChat[]>({
    queryKey: [`/api/clients/${clientId}/tuck/chats`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/tuck/chats`);
      if (!res.ok) throw new Error("Failed to fetch chats");
      return res.json();
    },
    enabled: !!clientId,
  });

  const { data: messages = [] } = useQuery<TuckMessage[]>({
    queryKey: [`/api/clients/${clientId}/tuck/chats/${activeChatId}/messages`],
    queryFn: async () => {
      const res = await fetch(
        `/api/clients/${clientId}/tuck/chats/${activeChatId}/messages`
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!activeChatId,
  });

  useEffect(() => {
    if (chats.length > 0 && !activeChatId) {
      setActiveChatId(chats[0].id);
    }
  }, [chats, activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const createChatMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/tuck/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (!res.ok) throw new Error("Failed to create chat");
      return res.json() as Promise<TuckChat>;
    },
    onSuccess: (chat) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/clients/${clientId}/tuck/chats`],
      });
      setActiveChatId(chat.id);
      setSheetOpen(false);
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: number) => {
      const res = await fetch(
        `/api/clients/${clientId}/tuck/chats/${chatId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete chat");
    },
    onSuccess: (_, chatId) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/clients/${clientId}/tuck/chats`],
      });
      if (activeChatId === chatId) {
        const remaining = chats.filter((c) => c.id !== chatId);
        setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      chatId,
      content,
      imageUrl,
    }: {
      chatId: number;
      content: string;
      imageUrl?: string;
    }) => {
      const res = await fetch(
        `/api/clients/${clientId}/tuck/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, imageUrl: imageUrl || null }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/clients/${clientId}/tuck/chats/${activeChatId}/messages`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/clients/${clientId}/tuck/chats`],
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = async () => {
    if ((!input.trim() && !imagePreview) || isThinking) return;
    let chatId = activeChatId;
    if (!chatId) {
      const chat = await createChatMutation.mutateAsync();
      chatId = chat.id;
    }
    const content = input.trim();
    const imgUrl = imagePreview;
    setInput("");
    setImagePreview(null);
    setIsThinking(true);
    try {
      await sendMessageMutation.mutateAsync({
        chatId,
        content,
        imageUrl: imgUrl || undefined,
      });
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Max 5MB",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const toggleListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: "Not supported",
        description: "Speech recognition isn't available in this browser.",
        variant: "destructive",
      });
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, toast]);

  const handleSelectChat = (id: number) => {
    setActiveChatId(id);
    setSheetOpen(false);
  };

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <AppLayout title="Talk to Neo AI" mode="client">
      {/* Full-height chat container — uses dvh for mobile browsers */}
      <div className="flex h-[calc(100dvh-7rem)] md:h-[calc(100vh-8rem)] rounded-xl border border-border overflow-hidden bg-background">

        {/* Desktop: persistent left sidebar */}
        <div className="hidden md:flex w-64 flex-shrink-0 flex-col bg-muted/40 border-r border-border">
          <ChatList
            chats={chats}
            activeChatId={activeChatId}
            onSelect={handleSelectChat}
            onDelete={(id) => deleteChatMutation.mutate(id)}
            onCreate={() => createChatMutation.mutate()}
            isCreating={createChatMutation.isPending}
          />
        </div>

        {/* Chat area — full width on mobile */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Chat header */}
          <div className="flex items-center gap-2 px-3 md:px-6 py-3 border-b border-border bg-background">
            {/* Mobile: chats sheet trigger */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-8 w-8 flex-shrink-0"
                  data-testid="button-open-chats"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle className="text-sm">Chat History</SheetTitle>
                </SheetHeader>
                <div className="flex-1 h-[calc(100vh-60px)]">
                  <ChatList
                    chats={chats}
                    activeChatId={activeChatId}
                    onSelect={handleSelectChat}
                    onDelete={(id) => deleteChatMutation.mutate(id)}
                    onCreate={() => createChatMutation.mutate()}
                    isCreating={createChatMutation.isPending}
                  />
                </div>
              </SheetContent>
            </Sheet>

            <div className="h-8 w-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Neo AI</p>
              <p className="text-xs text-muted-foreground truncate">
                {activeChat ? activeChat.title : "Your marketing coach"}
              </p>
            </div>
          </div>

          {/* Messages area */}
          <ScrollArea className="flex-1 px-3 md:px-6 py-4">
            {!activeChatId ? (
              <div className="flex flex-col items-center justify-center h-full py-12 gap-4 text-center">
                <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-black flex items-center justify-center">
                  <Bot className="h-7 w-7 md:h-8 md:w-8 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-base md:text-lg">Hey, I'm Neo!</h3>
                  <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                    Your AI marketing coach. Ask me about your stats, strategy, ad copy,
                    or email sequences.
                  </p>
                </div>
                <Button
                  onClick={() => createChatMutation.mutate()}
                  className="bg-black text-white hover:bg-gray-800"
                  data-testid="button-start-chat"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Start a conversation
                </Button>
              </div>
            ) : messages.length === 0 && !isThinking ? (
              <div className="flex flex-col items-center justify-center h-full py-12 gap-3 text-center">
                <Bot className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  What would you like to talk about?
                </p>
              </div>
            ) : (
              <div className="space-y-4 md:space-y-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2 md:gap-3",
                      msg.role === "user" ? "flex-row-reverse" : ""
                    )}
                    data-testid={`message-${msg.id}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="h-6 w-6 md:h-7 md:w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="h-3 w-3 md:h-3.5 md:w-3.5 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] md:max-w-[75%] rounded-2xl px-3 md:px-4 py-2 md:py-3 text-sm",
                        msg.role === "user"
                          ? "bg-black text-white rounded-tr-sm"
                          : "bg-muted rounded-tl-sm"
                      )}
                    >
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="Uploaded"
                          className="rounded-lg mb-2 max-h-40 md:max-h-48 object-contain w-full"
                        />
                      )}
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {isThinking && (
                  <div className="flex gap-2 md:gap-3">
                    <div className="h-6 w-6 md:h-7 md:w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-3 w-3 md:h-3.5 md:w-3.5 text-white" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-border p-3 md:p-4 bg-background">
            {imagePreview && (
              <div className="relative inline-block mb-2">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="h-16 md:h-20 rounded-lg border border-border object-contain"
                />
                <button
                  onClick={() => setImagePreview(null)}
                  className="absolute -top-2 -right-2 bg-black text-white rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Neo anything..."
                className="flex-1 min-h-[44px] max-h-32 resize-none text-sm"
                disabled={!activeChatId && createChatMutation.isPending}
                data-testid="input-message"
              />

              {/* Action buttons — row on mobile, column on desktop */}
              <div className="flex md:flex-col gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 w-9 flex-shrink-0"
                  title="Upload image"
                  data-testid="button-upload-image"
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>

                <Button
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  onClick={toggleListening}
                  className="h-9 w-9 flex-shrink-0"
                  title={isListening ? "Stop" : "Speak"}
                  data-testid="button-mic"
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>

                <Button
                  onClick={handleSend}
                  disabled={(!input.trim() && !imagePreview) || isThinking}
                  className="h-9 w-9 flex-shrink-0 bg-black text-white hover:bg-gray-800"
                  size="icon"
                  data-testid="button-send"
                >
                  {isThinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <p className="hidden md:block text-[11px] text-muted-foreground mt-2 text-center">
              Neo can analyze images, review stats, and give marketing advice. Press Enter to send.
            </p>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
        data-testid="input-file"
      />
    </AppLayout>
  );
}
