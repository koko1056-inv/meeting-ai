import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "";

interface Utterance {
  time: string;
  speaker: string;
  lang: string;
  original: string;
  translated: string;
}

interface Summary {
  title_ja?: string;
  title_vi?: string;
  participants?: string[];
  topics_ja?: string[];
  topics_vi?: string[];
  decisions_ja?: string[];
  decisions_vi?: string[];
  actions?: { task_ja: string; task_vi: string; assignee: string; deadline: string }[];
  error?: string;
}

interface MinutesData {
  utterances: Utterance[];
  summary: Summary;
}

type Tab = "summary" | "transcript";

export default function MinutesPreviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [data, setData] = useState<MinutesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<"ja" | "vi">("ja");
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessions/${sessionId}/minutes`);
        if (!res.ok) throw new Error("議事録の取得に失敗しました");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "不明なエラー");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">議事録プレビュー</h1>
            <p className="text-xs text-gray-400">Innovation Hub</p>
          </div>
          <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            新しいセッション
          </Link>
        </div>

        {isLoading && (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400">議事録を生成中...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 rounded-lg p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Tab + Language */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                <TabBtn active={tab === "summary"} onClick={() => setTab("summary")}>
                  サマリー
                </TabBtn>
                <TabBtn active={tab === "transcript"} onClick={() => setTab("transcript")}>
                  全文ログ
                </TabBtn>
              </div>
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                <TabBtn active={lang === "ja"} onClick={() => setLang("ja")}>
                  日本語
                </TabBtn>
                <TabBtn active={lang === "vi"} onClick={() => setLang("vi")}>
                  ベトナム語
                </TabBtn>
              </div>
            </div>

            {tab === "summary" && <SummaryView summary={data.summary} lang={lang} />}
            {tab === "transcript" && <TranscriptView utterances={data.utterances} lang={lang} />}
          </>
        )}

        <footer className="text-center text-xs text-gray-500 pt-4">
          Innovation Hub
        </footer>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryView({ summary, lang }: { summary: Summary; lang: "ja" | "vi" }) {
  if (summary.error) {
    return (
      <div className="bg-red-900/30 rounded-lg p-4">
        <p className="text-red-400 text-sm">{summary.error}</p>
      </div>
    );
  }

  const title = lang === "ja" ? summary.title_ja : summary.title_vi;
  const topics = lang === "ja" ? summary.topics_ja : summary.topics_vi;
  const decisions = lang === "ja" ? summary.decisions_ja : summary.decisions_vi;

  return (
    <div className="space-y-4">
      {title && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-bold text-white">{title}</h2>
        </div>
      )}

      {summary.participants && summary.participants.length > 0 && (
        <Section title="参加者">
          <div className="flex flex-wrap gap-2">
            {summary.participants.map((p, i) => (
              <span key={i} className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-200">
                {p}
              </span>
            ))}
          </div>
        </Section>
      )}

      {topics && topics.length > 0 && (
        <Section title={lang === "ja" ? "議題" : "Chu de"}>
          <ol className="space-y-1.5">
            {topics.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-indigo-400 font-medium shrink-0">{i + 1}.</span>
                {t}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {decisions && decisions.length > 0 && (
        <Section title={lang === "ja" ? "決定事項" : "Quyet dinh"}>
          <ul className="space-y-1.5">
            {decisions.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-green-400 shrink-0">-</span>
                {d}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.actions && summary.actions.length > 0 && (
        <Section title={lang === "ja" ? "アクションアイテム" : "Hanh dong"}>
          <div className="space-y-2">
            {summary.actions.map((a, i) => (
              <div key={i} className="bg-gray-900 rounded-lg p-3 flex items-start gap-3">
                <span className="text-yellow-400 font-mono text-xs shrink-0 mt-0.5">#{i + 1}</span>
                <div className="flex-1 text-sm">
                  <p className="text-gray-200">{lang === "ja" ? a.task_ja : a.task_vi}</p>
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    <span>担当: <span className="text-gray-300">{a.assignee}</span></span>
                    <span>期限: <span className="text-gray-300">{a.deadline}</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function TranscriptView({ utterances, lang }: { utterances: Utterance[]; lang: "ja" | "vi" }) {
  if (utterances.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <p className="text-gray-400 text-sm">発話ログがありません</p>
      </div>
    );
  }

  // 話者ごとに色を割り当て
  const speakers = [...new Set(utterances.map((u) => u.speaker))];
  const colors = [
    "border-indigo-500 bg-indigo-900/20",
    "border-emerald-500 bg-emerald-900/20",
    "border-amber-500 bg-amber-900/20",
    "border-pink-500 bg-pink-900/20",
    "border-cyan-500 bg-cyan-900/20",
    "border-purple-500 bg-purple-900/20",
  ];
  const badgeColors = [
    "bg-indigo-900/50 text-indigo-300",
    "bg-emerald-900/50 text-emerald-300",
    "bg-amber-900/50 text-amber-300",
    "bg-pink-900/50 text-pink-300",
    "bg-cyan-900/50 text-cyan-300",
    "bg-purple-900/50 text-purple-300",
  ];
  const speakerColor = (s: string) => colors[speakers.indexOf(s) % colors.length];
  const speakerBadge = (s: string) => badgeColors[speakers.indexOf(s) % badgeColors.length];

  return (
    <div className="space-y-2">
      {utterances.map((u, i) => {
        const text = lang === "ja"
          ? (u.lang === "ja" ? u.original : u.translated)
          : (u.lang === "vi" ? u.original : u.translated);

        return (
          <div
            key={i}
            className={`rounded-lg p-3 border-l-2 ${speakerColor(u.speaker)}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${speakerBadge(u.speaker)}`}>
                {u.speaker}
              </span>
              <span className="text-xs text-gray-500 font-mono">{u.time}</span>
            </div>
            <p className="text-sm text-gray-200 leading-relaxed">{text}</p>
          </div>
        );
      })}
    </div>
  );
}
