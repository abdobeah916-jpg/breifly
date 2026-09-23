import { useState } from "react";
import { ArrowUpLeft, MessageCircle, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string; confidence?: string };

export default function BrieflyAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "أهلًا! اسألني عن Briefly أو كيف تكتب brief أوضح.", confidence: "known" },
  ]);
  const ask = trpc.assistant.ask.useMutation({
    onSuccess: result => {
      setMessages(current => [...current, { role: "assistant", content: result.answer, confidence: result.confidence }]);
      if (result.followUpQuestion) setMessages(current => [...current, { role: "assistant", content: result.followUpQuestion, confidence: "suggested" }]);
    },
    onError: error => toast.error(error.message || "تعذر الوصول إلى المساعد."),
  });
  const submit = () => {
    const text = question.trim();
    if (!text || ask.isPending) return;
    setMessages(current => [...current, { role: "user", content: text }]);
    setQuestion("");
    ask.mutate({ question: text, history: messages.slice(-8).map(({ role, content }) => ({ role, content })) });
  };

  return <div className="fixed bottom-5 left-5 z-50">
    {open && <div className="mb-3 w-[min(360px,calc(100vw-40px))] overflow-hidden rounded-[24px] border border-[#191816]/10 bg-[#fffdf8] shadow-[0_18px_55px_rgba(25,24,22,.18)]">
      <div className="flex items-start justify-between bg-[#191816] p-4 text-[#fffdf8]"><div className="flex gap-3"><div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#ef5b2a]"><Sparkles className="h-4 w-4" /></div><div><p className="text-sm font-bold">Briefly Assistant</p><p className="mt-0.5 text-[11px] text-[#fffdf8]/60">مساعد للوضوح، وليس بديلًا عن الفريق</p></div></div><button aria-label="إغلاق المساعد" onClick={() => setOpen(false)} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
      <div className="max-h-[330px] space-y-3 overflow-y-auto p-4" dir="rtl">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "mr-8 rounded-2xl rounded-tr-sm bg-[#f1ece2] p-3 text-sm" : "ml-5 rounded-2xl rounded-tl-sm bg-[#f7c947]/20 p-3 text-sm"}><p className="leading-6">{message.content}</p>{message.role === "assistant" && message.confidence && <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-[#756f66]">{message.confidence === "known" ? "معلومة مؤكدة" : message.confidence === "suggested" ? "اقتراح" : "يحتاج تأكيدًا بشريًا"}</p>}</div>)}{ask.isPending && <div className="ml-5 rounded-2xl rounded-tl-sm bg-[#f7c947]/20 p-3 text-xs text-[#756f66]">جاري التفكير...</div>}</div>
      <div className="flex gap-2 border-t border-[#191816]/10 p-3"><input value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submit(); }} placeholder="اسأل عن Briefly..." className="min-w-0 flex-1 rounded-xl border border-[#191816]/10 bg-[#f5f1e9] px-3 py-2 text-sm outline-none focus:border-[#ef5b2a]" /><button aria-label="إرسال السؤال" onClick={submit} disabled={ask.isPending || !question.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ef5b2a] text-white hover:bg-[#d9481a] disabled:cursor-not-allowed disabled:opacity-50"><ArrowUpLeft className="h-4 w-4" /></button></div>
    </div>}
    <button onClick={() => setOpen(value => !value)} className="group flex items-center gap-3 rounded-full bg-[#191816] py-3 pl-4 pr-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(25,24,22,.2)] hover:-translate-y-0.5 hover:bg-[#ef5b2a]" aria-label="فتح مساعد Briefly"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f7c947] text-[#191816]"><MessageCircle className="h-4 w-4" /></span><span className="hidden sm:inline">اسأل Briefly</span></button>
  </div>;
}
