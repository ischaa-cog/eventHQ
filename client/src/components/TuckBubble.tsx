import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Bot,
  X,
  Send,
  Mic,
  MicOff,
  Loader2,
  Maximize2,
} from "lucide-react";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";

interface TuckMessage {
  id: number;
  chatId: number;
  role: "user" | "assistant";
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

interface TuckBubbleProps {
  clientId: string;
  pageContext?: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function TuckBubble({ clientId, pageContext }: TuckBubbleProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TuckMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, isOpen]);

  const ensureChat = async (): Promise<number> => {
    if (chatId) return chatId;
    const res = await fetch(`/api/clients/${clientId}/tuck/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Quick Chat — ${pageContext || "Dashboard"}` }),
    });
    if (!res.ok) throw new Error("Could not create chat");
    const chat = await res.json();
    setChatId(chat.id);
    queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/tuck/chats`] });
    return chat.id;
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    const text = input.trim();
    setInput("");
    setIsThinking(true);

    const id = await ensureChat();

    // Optimistic user message
    const tempUserMsg: TuckMessage = {
      id: Date.now(),
      chatId: id,
      role: "user",
      content: text,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/clients/${clientId}/tuck/chats/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, pageContext }),
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/tuck/chats`] });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
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

  const toggleListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
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
  }, [isListening]);

  const goToFullPage = () => {
    setIsOpen(false);
    setLocation(`/client/${clientId}/tuck`);
  };

  return (
    <>
      {/* Floating bubble button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#38B6FF] text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
        data-testid="button-neo-bubble"
        title="Talk to Neo AI"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Bot className="h-6 w-6" />
        )}
      </button>

      {/* Chat widget */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "480px" }}
          data-testid="neo-bubble-widget"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#38B6FF] text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="font-semibold text-sm">Neo AI</p>
                <p className="text-[11px] opacity-70">Your marketing coach</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={goToFullPage}
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                title="Open full chat"
                data-testid="button-neo-expand"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                data-testid="button-neo-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            {messages.length === 0 && !isThinking ? (
              <div className="flex flex-col items-center justify-center h-full py-8 gap-3 text-center">
                <Bot className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Hi! Ask me anything about your marketing, events, or stats.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "")}
                  >
                    {msg.role === "assistant" && (
                      <div className="h-6 w-6 rounded-full bg-[#38B6FF] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl px-3 py-2 text-xs",
                        msg.role === "user"
                          ? "bg-[#38B6FF] text-white rounded-tr-sm"
                          : "bg-muted rounded-tl-sm"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-xs dark:prose-invert max-w-none text-xs">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {isThinking && (
                  <div className="flex gap-2">
                    <div className="h-6 w-6 rounded-full bg-[#38B6FF] flex items-center justify-center flex-shrink-0">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                    <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-3 bg-background">
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Neo..."
                className="min-h-[40px] max-h-24 resize-none text-sm"
                disabled={isThinking}
                data-testid="input-neo-bubble-message"
              />
              <div className="flex flex-col gap-1">
                <Button
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  onClick={toggleListening}
                  className="h-8 w-8"
                  data-testid="button-neo-bubble-mic"
                >
                  {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isThinking}
                  className="h-8 w-8 bg-[#38B6FF] text-white hover:bg-[#2da0e6]"
                  size="icon"
                  data-testid="button-neo-bubble-send"
                >
                  {isThinking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
